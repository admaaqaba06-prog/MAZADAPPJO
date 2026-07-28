import React from 'react';
import { motion } from 'motion/react';

type PressableProps = {
  /** JSX list key (consumed by React itself, never forwarded as a prop). */
  key?: React.Key;
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  /** DOM id — kept for the same debug/smoke-test hooks plain buttons carry. */
  id?: string;
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
  id,
  ...rest
}: PressableProps) {
  return (
    <motion.button
      type={type}
      id={id}
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
