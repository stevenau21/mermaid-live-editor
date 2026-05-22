<script lang="ts">
  import * as Dialog from '$/components/ui/dialog';
  import { Button } from '$/components/ui/button';
  import { updateCode } from '$lib/util/state';
  import SparklesIcon from '~icons/hugeicons/sparkles';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let input = $state('');
  let loading = $state(false);
  let error = $state('');

  $effect(() => {
    if (open) {
      input = '';
      error = '';
    }
  });

  function extractMermaidCode(text: string): string {
    const match = text.match(/```mermaid\n?([\s\S]*?)```/);
    if (match) return match[1].trim();
    const altMatch = text.match(/```\n?([\s\S]*?)```/);
    if (altMatch) return altMatch[1].trim();
    return text.trim();
  }

  async function generate() {
    if (!input.trim() || loading) return;
    loading = true;
    error = '';

    try {
      const res = await fetch('/api/ollama/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-v4-pro:cloud',
          stream: false,
          messages: [
            {
              role: 'system',
              content: `You are a Mermaid diagram expert. The user will describe what they want to visualize. Your job is to output ONLY valid Mermaid JS syntax — no explanations, no commentary, no markdown wrapping.

Rules:
- Start directly with the diagram type keyword (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, pie, mindmap, timeline, quadrantChart, gitGraph, C4Context, sankey-beta, journey, requirementDiagram)
- Use proper Mermaid syntax with correct indentation
- Make the diagram comprehensive and visually clear
- Use labels, subgraphs, and annotations where appropriate
- For flowcharts, use proper node shapes: [] rectangle, () rounded, {} rhombus, [()] circle, (( )) double circle, >] asymmetric, {{ }} hexagon, [/ /] parallelogram
- For sequence diagrams, include proper participant names and use arrows like ->>, -->> for different semantics
- If the user mentions a specific theme, apply it via init directive: %%{init: {'theme': 'forest'}}%%`
            },
            {
              role: 'user',
              content: `Create a Mermaid diagram for: ${input}`
            }
          ]
        })
      });

      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);

      const data = await res.json();
      const code = extractMermaidCode(data.message?.content || '');

      if (!code) {
        error = 'No diagram code received. Try rephrasing your description.';
        return;
      }

      updateCode(code);
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Generation failed';
    } finally {
      loading = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex w-full max-w-lg flex-col gap-4 bg-background p-6">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-lg font-semibold">
        <SparklesIcon class="size-5 text-accent" />
        Generate Mermaid Diagram
      </Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        Describe what you want and generate a diagram using local AI
      </Dialog.Description>
    </Dialog.Header>

    <textarea
      disabled={loading}
      bind:value={input}
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          generate();
        }
      }}
      placeholder="e.g. A flowchart showing a user login process with success and error paths..."
      rows="5"
      class="rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
    ></textarea>

    {#if error}
      <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" size="sm" disabled={loading} onclick={() => open = false}>
        Cancel
      </Button>
      <Button variant="accent" size="sm" disabled={loading || !input.trim()} onclick={generate}>
        {#if loading}
          <span class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
        {/if}
        {loading ? 'Generating...' : 'Generate'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
