import { NextRequest, NextResponse } from 'next/server';
import { getUsers, createUser, getUserByEmail } from '@/lib/users';

export async function GET(request: NextRequest) {
  try {
    const users = await getUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, role, company, phone, photo, status, inviteToken, password } = body;

    // Validate required fields
    if (!email || !name) {
      return NextResponse.json(
        { error: 'Email and name are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Create the user
    const newUser = await createUser({
      email,
      name,
      role: role || 'client',
      company,
      phone,
      photo,
      status: status || 'invited',
      inviteToken,
      password: password || null,
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
