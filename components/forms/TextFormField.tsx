"use client"

import type { Control, FieldPath, FieldValues, RegisterOptions } from "react-hook-form"

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

type TextFormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>
  name: TName
  label: string
  placeholder?: string
  description?: string
  autoFocus?: boolean
  disabled?: boolean
  className?: string
  rules?: RegisterOptions<TFieldValues, TName>
}

export function TextFormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: TextFormFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      rules={props.rules}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
              placeholder={props.placeholder}
              autoFocus={props.autoFocus}
              disabled={props.disabled}
              className={props.className ?? "h-10 rounded-xl text-sm md:text-sm"}
            />
          </FormControl>
          {props.description ? <FormDescription>{props.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
