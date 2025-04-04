import { NextResponse } from 'next/server';

export async function GET() {
  // Get current date and time
  const now = new Date();
  
  // Format the date and time
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  
  // Return the formatted date and time
  return NextResponse.json({
    date: formattedDate,
    time: formattedTime,
    timestamp: now.getTime(),
    message: 'This data is protected by the demo-feature flag if you see this message the feature flag is enabled'
  });
} 