import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(['算法笔记', '课程笔记', '项目记录', '周报/碎碎念']),
    description: z.string(),
    draft: z.boolean().default(false),
    difficulty: z.string().optional(),
    platform: z.string().optional(),
    status: z.enum(['已通过', '进行中', '待复盘']).optional(),
  }),
});

export const collections = { blog };
