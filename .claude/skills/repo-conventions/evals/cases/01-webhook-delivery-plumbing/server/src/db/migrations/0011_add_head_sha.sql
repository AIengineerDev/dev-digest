ALTER TABLE "agent_runs" ADD COLUMN "head_sha" text;
ALTER TABLE "reviews" ADD COLUMN "head_sha" text;
ALTER TABLE "webhooks" ADD COLUMN "last_delivery_state" text;
