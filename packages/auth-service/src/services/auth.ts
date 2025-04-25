import bcrypt from 'bcrypt'


interface User {
  id: string
  email: string
  name: string
  password: string
}

interface RegisterInput {
  email: string
  password: string
  name: string
}

interface LoginInput {
  email: string
  password: string
}

export class AuthService {
  private users: User[] = [] // This will be replaced with a database

  async register(input: RegisterInput): Promise<Omit<User, 'password'>> {
    // Check if user exists
    const existingUser = this.users.find(user => user.email === input.email)
    if (existingUser) {
      throw new Error('User already exists')
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(input.password, 10)

    // Create user
    const user: User = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      password: hashedPassword,
    }

    this.users.push(user)

    // Return user without password
    const { password, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  async login(input: LoginInput): Promise<{ token: string; user: Omit<User, 'password'> }> {
    // Find user
    const user = this.users.find(u => u.email === input.email)
    if (!user) {
      throw new Error('Invalid credentials')
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(input.password, user.password)
    if (!isValidPassword) {
      throw new Error('Invalid credentials')
    }

    // Generate token (this will be handled by Fastify JWT)
    const token = 'dummy-token' // This will be replaced with actual JWT token

    // Return user without password
    const { password, ...userWithoutPassword } = user
    return {
      token,
      user: userWithoutPassword,
    }
  }
} 