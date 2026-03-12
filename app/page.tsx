import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Page() {
  return (
    <header className='flex items-center justify-center h-screen flex-col gap-4'>
      <h1 className='text-4xl'>Portal</h1>
      <div className='flex gap-3'>
        <Button asChild className='rounded-full px-6 bg-blue-500 hover:bg-blue-600 text-white'>
          <Link href="/sign-in">
            Sign In
          </Link>
        </Button>
        <Button asChild variant="outline" className='rounded-full px-6 border-blue-500'>
          <Link href="/sign-up">
            Sign Up
          </Link>
        </Button>
      </div>
      <p className='text-xl text-gray-500'>
        3D Codex for Designers
      </p>
    </header>
  )
}
