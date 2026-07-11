export const PROMPT_TEMPLATES = {
  visualCreate: `Create a new visual for the canvas.

Brief: {{request}}
Target ratio: {{aspectRatio}}
Context: {{intendedUse}}

Requirements:
- Clear focal subject suitable for later mark-up on the board
- Clean composition with readable hierarchy
- No watermarks, garbled text, or visual artifacts`,
  editFromMarks: `Revise the source visual using the marked instructions below.

Additional notes:
{{userRequest}}

Marked changes:
{{annotationList}}

Constraints:
- Leave every unmarked area unchanged
- Preserve brand text and layout unless a mark explicitly requests a change
- Keep the original aspect ratio and overall visual identity`,
  workflowRun: `Execute workflow "{{skillName}}" for this request:

{{userRequest}}

Process each planned output in order and place finished visuals back on the board.`
} as const

export type PromptTemplateName = keyof typeof PROMPT_TEMPLATES

export function renderPromptTemplate(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.replaceAll(`{{${key}}}`, value),
    template
  )
}
