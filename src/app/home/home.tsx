'use client';
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AudioDrop from "@/components/AudioDrop";
import MindMap from "@/components/MindMap";
import Hero from "@/components/Hero"; // Import the Hero component

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";

export default function Home() {

  return (
    // Remove min-height from the main content div if Hero takes full screen
    <div> 
      <Hero /> {/* Add the Hero component here */}
      
      {/* Wrap existing content in a separate div for padding/margin */}
      <div className="flex flex-col items-start justify-center p-8 gap-8">
        <Card className="w-full max-w-[95vw] border border-gray-200 dark:border-gray-700 p-6 rounded-xl glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-4xl font-bold text-gray-800 dark:text-gray-200">
              sonicseeka
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AudioDrop />
          </CardContent>
        </Card>
        
        <Card className="w-full max-w-[95vw] border border-gray-200 dark:border-gray-700 p-6 rounded-xl glass-card">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
              Generated Mind Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MindMap />
          </CardContent>
        </Card>
      </div>
 </div>
);
}