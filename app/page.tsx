import React from 'react'
import Link from 'next/link'

function page() {
  return (
    <header className='flex items-center justify-center h-screen flex-col gap-4'>
      <h1 className='text-4xl'>Portal</h1>
      <button className='rounded-full bg-blue-400 px-6 py-2 text-black font-medium hover:bg-blue-500 hover:text-white transition-colors cursor-pointer'>
        Get Started
      </button>
      <p className='text-xl text-gray-500'>
        3D Codex for Designers
      </p>
    </header>
  )
}

export default page