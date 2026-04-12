import { NextResponse } from 'next/server';
import { robot, relfar } from '@/lib/services';

export async function GET() {
  const [robotHealth, relfarHealth] = await Promise.all([
    robot.health(),
    relfar.health(),
  ]);

  return NextResponse.json({
    robot: { ...robotHealth, url: process.env.ROBOT_SERVICE_URL || 'http://localhost:8080' },
    relfar: { ...relfarHealth, url: process.env.RELFAR_SERVICE_URL || 'http://localhost:5000' },
    checkedAt: new Date().toISOString(),
  });
}
