import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const predictionLogsTable = pgTable("prediction_logs", {
  id:             serial("id").primaryKey(),
  gameKey:        text("game_key").notNull(),
  sessionId:      integer("session_id").notNull(),
  action:         text("action").notNull(),             // "BET" | "SKIP"
  predictedLabel: text("predicted_label"),
  actualLabel:    text("actual_label"),
  confidence:     integer("confidence").notNull(),
  trendScore:     integer("trend_score"),
  freqScore:      integer("freq_score"),
  revScore:       integer("rev_score"),
  isCorrect:      boolean("is_correct"),
  createdAt:      timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  verifiedAt:     timestamp("verified_at", { withTimezone: true }),
  hourOfDay:      integer("hour_of_day"),
});

export const insertPredictionLogSchema = createInsertSchema(predictionLogsTable).omit({ id: true, createdAt: true });
export type InsertPredictionLog = z.infer<typeof insertPredictionLogSchema>;
export type PredictionLog = typeof predictionLogsTable.$inferSelect;
