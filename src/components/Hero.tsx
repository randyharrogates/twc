import { motion } from 'framer-motion';
import { Mascot } from './Mascot';
import { ChevronDown } from './ui/icons';

export function Hero() {
  const scrollToGroups = () => {
    document.getElementById('groups')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      id="home"
      className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-6"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 md:grid-cols-[1fr_320px]">
        <div>
          <p className="font-script text-xl text-accent-400">where money stays even</p>
          <h1 className="mt-3 font-display text-7xl leading-none tracking-tight text-ink-800 md:text-8xl">
            split<span className="text-accent-400">.</span>
            <br />
            settle<span className="text-accent-400">.</span>
            <br />
            done<span className="text-accent-400">.</span>
          </h1>
          <p className="mt-6 max-w-md text-ink-600">
            Log shared expenses across any of nine currencies. Even splits, shares, exact
            amounts, percentages — all the math, none of the spreadsheet.
          </p>
          <div className="mt-8 flex gap-3">
            <motion.button
              onClick={scrollToGroups}
              whileHover={{ y: -2 }}
              className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-6 py-3 font-display text-sm tracking-widest text-ink-0 glow-accent-sm transition-colors hover:bg-accent-400"
            >
              GET STARTED
            </motion.button>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="justify-self-center"
        >
          <Mascot className="h-64 w-64 md:h-80 md:w-80" />
        </motion.div>
      </div>

      <motion.button
        onClick={scrollToGroups}
        aria-label="Scroll to groups"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 6, 0] }}
        transition={{ y: { repeat: Infinity, duration: 2 }, opacity: { delay: 0.8 } }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-500 hover:text-accent-400"
      >
        <ChevronDown className="h-6 w-6" />
      </motion.button>
    </section>
  );
}
