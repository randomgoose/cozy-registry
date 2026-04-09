"use client"

import type { Control, FieldPath, FieldValues } from "react-hook-form"

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"

type TextareaFormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>
  name: TName
  label: string
  placeholder?: string
  description?: string
  rows?: number
  disabled?: boolean
  className?: string
}

export function TextareaFormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: TextareaFormFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
              placeholder={props.placeholder}
              rows={props.rows}
              disabled={props.disabled}
              className={props.className ?? "rounded-xl text-sm md:text-sm"}
            />
          </FormControl>
          {props.description ? <FormDescription>{props.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
