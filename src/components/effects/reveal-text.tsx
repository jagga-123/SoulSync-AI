"use client";

import { motion, type Variants } from "framer-motion";
import type { ElementType, ReactNode } from "react";

interface RevealTextProps {
  text: string;
  as?: ElementType;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  once?: boolean;
}

const container: Variants = {
  hidden: {},
  visible: (custom: { delay: number; stagger: number }) => ({
    transition: {
      delayChildren: custom.delay,
      staggerChildren: custom.stagger,
    },
  }),
};

const word: Variants = {
  hidden: { y: "110%", opacity: 0 },
  visible: {
    y: "0%",
    opacity: 1,
    transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
  },
};

export function RevealText({
  text,
  as: Tag = "div",
  className = "",
  wordClassName = "",
  delay = 0,
  stagger = 0.06,
  once = true,
}: RevealTextProps) {
  const words = text.split(" ");

  return (
    <Tag className={className}>
      <motion.span
        className="inline"
        initial="hidden"
        whileInView="visible"
        viewport={{ once, amount: 0.6 }}
        variants={container}
        custom={{ delay, stagger }}
      >
        {words.map((w, i) => (
          <span
            key={`${w}-${i}`}
            className="inline-block overflow-hidden pb-[0.12em] align-bottom"
          >
            <motion.span
              variants={word}
              className={`inline-block ${wordClassName}`}
            >
              {w}
              {i !== words.length - 1 ? " " : ""}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

export function FadeIn({
  children,
  className = "",
  delay = 0,
  y = 24,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.3 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
