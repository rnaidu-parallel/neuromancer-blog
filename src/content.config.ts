import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    margin_note: z.string().optional(),
    reader_margin: z.array(z.string()).optional(),
    sidenotes: z.array(z.object({ anchor: z.string(), text: z.string() })).optional(),
    plate: z.object({ kind: z.string(), params: z.record(z.any()).optional() }).optional(),
    /** social-share card; site-root path or absolute URL. Falls back to og-default.png. */
    image: z.string().optional(),
  }),
});

export const collections = { blog };
