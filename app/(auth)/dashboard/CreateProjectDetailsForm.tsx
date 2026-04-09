"use client"

import { useForm } from "react-hook-form"

import { TextFormField } from "@/components/forms/TextFormField"
import { TextareaFormField } from "@/components/forms/TextareaFormField"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { DialogFooter } from "@/components/ui/dialog"

type CreateProjectDetailsValues = {
  title: string
  defaultThemeResourceRefsInput: string
}

type CreateProjectDetailsFormProps = {
  creating: boolean
  onSubmit: (values: CreateProjectDetailsValues) => Promise<void> | void
  onCancel: () => void
}

export function CreateProjectDetailsForm(props: CreateProjectDetailsFormProps) {
  const form = useForm<CreateProjectDetailsValues>({
    mode: "onChange",
    defaultValues: {
      title: "",
      defaultThemeResourceRefsInput: "",
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await props.onSubmit(values)
        })}
        className="space-y-4"
      >
        <TextFormField
          control={form.control}
          name="title"
          label="Project name"
          placeholder="Marketing Blocks"
          autoFocus
          disabled={props.creating}
          rules={{ required: "Project name is required" }}
        />

        <TextareaFormField
          control={form.control}
          name="defaultThemeResourceRefsInput"
          label="Default theme resources"
          placeholder={"@indeed-cozy/ds/theme\n@indeed-cozy/ds/components"}
          description="Optional. One ref per line. Applied in order to preview and docs for resources in this project."
          rows={3}
          disabled={props.creating}
        />

        <DialogFooter className="flex flex-row flex-wrap justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={props.onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={props.creating || !form.formState.isValid}
          >
            {props.creating ? "Creating..." : "Continue"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
