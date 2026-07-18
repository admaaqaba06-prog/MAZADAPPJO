import React from 'react';
import { motion } from 'motion/react';

type PressableProps = {
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  /** Optional hover treatment, e.g. { scale: 1.02 }. Off by default. */
  whileHover?: Record<string, number | string>;
};

/**
 * Tactile button primitive: every press gets an instant scale-down response.
 * House motion style — smooth ease-out, no bouncy springs.
 */
export default function Pressable({
  children,
  className,
  onClick,
  disabled,
  type = 'button',
  whileHover,
  ...rest
}: PressableProps) {
  return (
    <motion.button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      whileHover={disabled ? undefined : whileHover}
      transition={{ duration: 0.12, ease: 'easeOut' }}
    >
      {children}
    </motion.button>
  );
}
