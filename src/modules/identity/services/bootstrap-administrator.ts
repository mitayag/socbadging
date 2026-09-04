import { hash } from "argon2";
import { z } from "zod";

const bootstrapSchema = z.object({
  name: z.string().trim().min(2),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(14, "Bootstrap password must be at least 14 characters"),
});

export type BootstrapRepository = {
  findByEmail(email: string): Promise<{ id: string } | null>;
  createAdministrator(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<{ id: string }>;
};

export async function bootstrapAdministrator(
  repository: BootstrapRepository,
  rawInput: { name: string; email: string; password: string },
): Promise<{ created: boolean; userId: string }> {
  const input = bootstrapSchema.parse(rawInput);
  const existing = await repository.findByEmail(input.email);
  if (existing) return { created: false, userId: existing.id };

  const created = await repository.createAdministrator({
    name: input.name,
    email: input.email,
    passwordHash: await hash(input.password, { type: 2 }),
  });
  return { created: true, userId: created.id };
}
