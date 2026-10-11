import { z } from 'zod';
export const Role = z.enum(['end_user','caregiver','administrator']);
export const Need = z.object({id:z.string(),ownerId:z.string(),title:z.string().min(1).max(80),description:z.string().min(1).max(300),status:z.enum(['draft','shared']),revision:z.number().int().positive(),createdAt:z.string(),expiresAt:z.string()});
export const Grant = z.object({id:z.string(),ownerId:z.string(),caregiverId:z.string(),label:z.string(),active:z.boolean()});
export const Usage = z.object({id:z.string(),startedAt:z.string(),endedAt:z.string().nullable(),reservedSeconds:z.number().int().nonnegative(),durationSeconds:z.number().int().nonnegative(),inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable()});
export const Snapshot = z.object({
  profile:z.object({id:z.string(),name:z.string(),role:Role}),
  subscription:z.object({status:z.string(),premium:z.boolean()}),
  keyRegistered:z.boolean(), dailyLimitSeconds:z.number().int().positive(),dailyReservedSeconds:z.number().int().nonnegative(),
  needs:z.array(Need),sharedNeeds:z.array(Need),grants:z.array(Grant),usage:z.array(Usage),
});
export const DraftInput = z.object({title:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(300)}).strict();
export const ShareInput = z.object({id:z.string().min(1),consent:z.literal(true),revision:z.number().int().positive()}).strict();
export const VoiceReply = z.object({sessionId:z.string(),sdp:z.string().optional(),maxSeconds:z.number().int().positive().max(600),demo:z.boolean()});
export const TokenReply = z.object({token:z.string().min(16)});
export const InviteReply = z.object({code:z.string().min(20),expiresAt:z.string()});
export const RedirectReply = z.object({url:z.string().url()});
export type Snapshot = z.infer<typeof Snapshot>;
export type Need = z.infer<typeof Need>;
export type Grant = z.infer<typeof Grant>;
export type Usage = z.infer<typeof Usage>;
export type DraftInput = z.infer<typeof DraftInput>;
