"use client"
import Link from 'next/link'
import { LivingCard } from '@/components/ui/living-card'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

const cards = [
  {
    title: 'Prompt',
    description: 'Direct the scene with natural language.',
  },
  {
    title: 'Compose',
    description: 'Refine layouts, structure, and spatial balance.',
  },
  {
    title: 'Launch',
    description: 'Start projects quickly with a cleaner workflow.',
  },
]

export default function Page() {
  return (
    <main className='flex min-h-screen items-center justify-center px-4 py-8 sm:px-6'>
      <div className='w-full max-w-5xl rounded-3xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8'>
        <motion.nav 
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className='grid grid-cols-1 gap-4 border-b border-neutral-800 pb-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center'
        >
          <div className='hidden sm:block' />
          <div className='text-center'>
            <p className='text-4xl font-semibold tracking-tight sm:text-5xl'>Portal</p>
          </div>
        </motion.nav>

        <section className='py-8 sm:py-10 flex overflow-hidden'>
          <div className='grid gap-6 w-full lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-center'>
            <div className='space-y-8'>
              <motion.div 
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className='space-y-4'
              >
                <h1 className='max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl'>
                  Build 3D scenes with a faster creative flow.
                </h1>
                <p className='max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg'>
                  Shape environments, iterate on ideas, and move from prompt to scene inside a workspace designed for modern 3D creation.
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className='flex flex-wrap items-center gap-3'
              >
                <Button asChild size="lg" className='rounded-full px-8'>
                  <Link href="/sign-up">
                    Sign Up
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className='rounded-full border-neutral-700 bg-neutral-900 px-8 hover:bg-neutral-800'>
                  <Link href="/sign-in">
                    Sign In
                  </Link>
                </Button>
              </motion.div>
            </div>

            <div className='grid gap-4 sm:grid-cols-3 lg:grid-cols-1'>
              {cards.map((card, index) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 1, delay: 0.2 + (index * 0.15), ease: [0.16, 1, 0.3, 1] }}
                >
                  <LivingCard
                    className='min-h-[160px] w-full'
                    overlay={
                      <div className="flex flex-col items-center justify-center h-full">
                        <p className='text-sm uppercase tracking-[0.3em] text-gray-400 text-center'>{card.title}</p>
                        <p className='mt-2.5 text-lg font-medium leading-snug text-center text-neutral-200'>
                          {card.description}
                        </p>
                      </div>
                    }
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
