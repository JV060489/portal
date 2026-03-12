import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Page() {
  return (
    <header className='flex items-center justify-center h-screen flex-col gap-4'>
      <h1 className='text-4xl'>Portal</h1>
      <div className='flex gap-3'>
        <Link href="/sign-in">
          <Button className='rounded-full px-6 bg-blue-500 hover:bg-blue-600 text-white'>
            Sign In
          </Button>
        </Link>
        <Link href="/sign-up">
          <Button variant="outline" className='rounded-full px-6 border-blue-500'>
            Sign Up
          </Button>
        </Link>
      </div>
      <p className='text-xl text-gray-500'>
        3D Codex for Designers
      </p>
    </header>
  )
}
