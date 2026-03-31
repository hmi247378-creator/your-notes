import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3001),
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** 兼容 OpenAI 的 API 基地址，如 DeepSeek: https://api.deepseek.com */
  OPENAI_BASE_URL: z.string().optional(),
  /** 模型名称，如 gpt-4o-mini(OpenAI) / deepseek-chat(DeepSeek) */
  LLM_MODEL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${message}`);
  }
  return parsed.data;
}

/** 是否启用 LLM 语义分类（需配置 OPENAI_API_KEY） */
export function isLLMClassifyEnabled(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !!key && key.length >= 10;
}

/** 获取 LLM 客户端配置（支持 OpenAI / DeepSeek 等兼容接口） */
export function getLLMConfig(): { apiKey: string; baseURL?: string; model: string } {
  const apiKey = process.env.OPENAI_API_KEY!;
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim() ?? (baseURL ? 'deepseek-chat' : 'gpt-4o-mini');
  return { apiKey, baseURL: baseURL || undefined, model };
}

