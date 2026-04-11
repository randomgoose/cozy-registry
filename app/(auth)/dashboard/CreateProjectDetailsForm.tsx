"use client"

import { useForm, useWatch } from "react-hook-form"

import { TextFormField } from "@/components/forms/TextFormField"
import { TextareaFormField } from "@/components/forms/TextareaFormField"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { DialogFooter } from "@/components/ui/dialog"
import {
  listStarterKitResourceTitlesByType,
  PRIMITIVES_KIT,
  type ProjectCreateMode,
} from "@/lib/starter-kits"

export type CreateProjectDetailsValues = {
  title: string
  createMode: ProjectCreateMode
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
      createMode: "empty",
      defaultThemeResourceRefsInput: "",
    },
  })

  const createMode = useWatch({ control: form.control, name: "createMode" })
  const primitivesKitThemeTitles = listStarterKitResourceTitlesByType(
    PRIMITIVES_KIT,
    "registry:theme",
  )
  const primitivesKitResourceTitles = listStarterKitResourceTitlesByType(
    PRIMITIVES_KIT,
    "registry:ui",
  )

  const templates: { value: ProjectCreateMode; title: string; description: string }[] = [
    {
      value: "empty",
      title: "Create from empty",
      description: "Start with a blank project and add starter content later.",

    },
    {
      value: "primitives-kit",
      title: "Create from primitives kit",
      description: "Start with a basic Cozy primitives baseline and theme layers.",
    },
  ]

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await props.onSubmit(values)
        })}
        className="space-y-4"
      >
        <div className="space-y-2">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Start from</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((option) => {
              const selected = createMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    form.setValue("createMode", option.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  aria-pressed={selected}
                  className={[
                    "rounded-2xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-primary bg-primary text-primary-foreground dark:border-primary dark:bg-primary dark:text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-input dark:border-input/50 dark:bg-input/50 dark:text-input dark:hover:border-input/70",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{option.title}</div>
                  <div
                    className={[
                      "mt-1 text-xs leading-5",
                      selected ? "text-zinc-100/85 dark:text-zinc-900/80" : "text-zinc-500 dark:text-zinc-400",
                    ].join(" ")}
                  >
                    {option.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <TextFormField
          control={form.control}
          name="title"
          label="Project name"
          placeholder="Marketing Blocks"
          autoFocus
          disabled={props.creating}
          rules={{ required: "Project name is required" }}
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
