"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "glass-strong fixed top-1/2 left-1/2 z-[81] max-h-[90svh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6 shadow-2xl shadow-black/60 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-8 font-display text-lg font-semibold text-white", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1.5 text-sm leading-relaxed text-white/55", className)} {...props} />
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription }
