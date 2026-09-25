import type { Metadata } from "next";
import { InterviewView } from "@/components/ai/interview-view";

export const metadata: Metadata = {
  title: "AI Interview",
  description: "Chat with SoulSync so it can learn who you are and find genuinely compatible people.",
  robots: { index: false, follow: false },
};

export default function AIInterviewPage() {
  return <InterviewView />;
}
