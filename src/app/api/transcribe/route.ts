import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import { writeFile, readFile, unlink } from 'fs/promises';

const execPromise = promisify(exec);

// Increase limits if needed
export const config = {
  api: {
    bodyParser: false, // Required for FormData
    responseLimit: '10mb',
  },
};

// Helper to find Python
async function findPythonExecutable(): Promise<string> {
    const candidates = process.platform === 'win32'
      ? [
          path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'python3.12.exe'),
          path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'python3.exe'),
          'python',
          'python3',
          path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
          'C:\\Python312\\python.exe',
          'C:\\Python311\\python.exe',
          'C:\\Python310\\python.exe',
        ]
      : ['python3', 'python'];

    for (const cmd of candidates) {
      try {
        await execPromise(`"${cmd}" --version`);
        console.log(`Found Python at: ${cmd}`);
        return cmd;
      } catch (e) {
        // Ignore and try next candidate
      }
    }
    console.error("Could not find Python executable.");
    throw new Error("Python executable not found.");
}


export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;
  let outputJsonPath: string | null = null;

  try {
    const formData = await request.formData();
    const mediaFile = formData.get('mediaFile') as File | null;
    const diarize = formData.get('diarize') === 'true'; // Get diarization flag

    if (!mediaFile) {
      return NextResponse.json({ error: 'No media file uploaded' }, { status: 400 });
    }

    // --- Get Hugging Face Token (from environment variable) ---
    const hfToken = process.env.HUGGING_FACE_TOKEN;
    if (diarize && !hfToken) {
        console.warn("Diarization requested, but HUGGING_FACE_TOKEN environment variable is not set.");
        // Optionally, you could choose to fail here or proceed without diarization
        // return NextResponse.json({ error: 'Hugging Face token not configured for diarization' }, { status: 500 });
    }

    // Create a temporary directory for uploads if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'whisper-uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Save the uploaded file temporarily
    const fileBuffer = Buffer.from(await mediaFile.arrayBuffer());
    tempFilePath = path.join(tempDir, `${Date.now()}-${mediaFile.name}`);
    await writeFile(tempFilePath, fileBuffer);
    console.log(`Temporary file saved to: ${tempFilePath}`);

    // Define path for the output JSON
    outputJsonPath = path.join(tempDir, `${path.basename(tempFilePath, path.extname(tempFilePath))}.json`);

    // Find Python executable
    const pythonPath = await findPythonExecutable();

    // Path to the transcription script
    const scriptPath = path.join(process.cwd(), 'src', 'whisper', 'transcribe.py');
    if (!fs.existsSync(scriptPath)) {
      console.error(`Transcription script not found at: ${scriptPath}`);
      return NextResponse.json({ error: 'Transcription script not found on server' }, { status: 500 });
    }

    // Construct the command
    const commandParts = [
      `"${pythonPath}"`,
      `"${scriptPath}"`,
      `--input "${tempFilePath}"`,
      `--output-json "${outputJsonPath}"`,
    ];

    if (diarize) {
      commandParts.push('--diarize');
      if (hfToken) {
        // Pass token securely (consider if direct command line is okay, or use env var within python script only)
        // Here we pass it as an argument, ensure your python script handles it
         commandParts.push(`--hf-token "${hfToken}"`);
      } else {
         console.warn("Proceeding with diarization request but without HF token.");
      }
    }
    // Add other Whisper args if needed (e.g., --model)

    const command = commandParts.join(' ');

    console.log(`Executing command: ${command.replace(hfToken ?? "dummy-token", "[HF_TOKEN_HIDDEN]")}`); // Hide token in logs

    // Execute the Python script
    try {
        const { stdout, stderr } = await execPromise(command, {
            timeout: 600000, // 10 minute timeout
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        if (stderr) {
            console.warn('Python script stderr:', stderr); // Log stderr as warning
        }
        console.log('Python script stdout:', stdout);

        // Check if the output JSON file was created
        if (!fs.existsSync(outputJsonPath)) {
            console.error('Output JSON file was not created by the script.');
            console.error('Script stderr:', stderr); // Log stderr again on error
            return NextResponse.json({ error: 'Transcription failed: Output file not generated.', details: stderr || stdout }, { status: 500 });
        }

        // Read the transcription result from the JSON file
        const transcriptionResult = await readFile(outputJsonPath, 'utf-8');
        const transcriptionData = JSON.parse(transcriptionResult);

        // Return the transcription data
        return NextResponse.json({ transcription: transcriptionData });

    } catch (execError: any) {
        console.error('Error executing Python script:', execError);
        // Try to read output JSON even if exec failed, might contain partial results or error info
        let errorDetails = execError.stderr || execError.stdout || execError.message || 'Unknown execution error';
        if (fs.existsSync(outputJsonPath)) {
             try {
                 const partialResult = await readFile(outputJsonPath, 'utf-8');
                 errorDetails += `\nPartial output: ${partialResult}`;
             } catch (readErr) { /* ignore read error */ }
        }
        return NextResponse.json({ error: 'Failed to execute transcription script.', details: errorDetails }, { status: 500 });
    }

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.', details: error.message || String(error) }, { status: 500 });
  } finally {
    // Clean up temporary files
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await unlink(tempFilePath);
        console.log(`Cleaned up temporary input file: ${tempFilePath}`);
      } catch (e) {
        console.error(`Error cleaning up temporary input file ${tempFilePath}:`, e);
      }
    }
    if (outputJsonPath && fs.existsSync(outputJsonPath)) {
      try {
        await unlink(outputJsonPath);
        console.log(`Cleaned up temporary output file: ${outputJsonPath}`);
      } catch (e) {
        console.error(`Error cleaning up temporary output file ${outputJsonPath}:`, e);
      }
    }
  }
}
