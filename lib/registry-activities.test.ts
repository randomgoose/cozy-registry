import { describe, expect, it } from "vitest";

import { activityPrimaryLine, decodeActivityCursor } from "@/lib/registry-activities";

function encodeActivityCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({
    t: createdAt.toISOString(),
    id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

describe("registry-activities cursor", () => {
  it("round-trips createdAt and id", () => {
    const createdAt = new Date("2026-04-10T12:00:00.000Z");
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const raw = encodeActivityCursor(createdAt, id);
    const decoded = decodeActivityCursor(raw);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(id);
    expect(decoded!.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("returns null for invalid input", () => {
    expect(decodeActivityCursor(null)).toBeNull();
    expect(decodeActivityCursor("")).toBeNull();
    expect(decodeActivityCursor("not-base64!!!")).toBeNull();
  });
});

describe("activityPrimaryLine", () => {
  it("renders version publish entries with actor and version", () => {
    expect(
      activityPrimaryLine(
        {
          id: "activity-1",
          createdAt: "2026-04-10T12:00:00.000Z",
          eventType: "item.version_published",
          actorType: "user",
          actorUserId: "user-1",
          actorName: "Chen",
          actorHandle: "chen",
          resourceType: "registry:ui",
          resourceName: "button",
          resourceTitle: "Button",
          resourceOwnerRef: "chen",
          versionLabel: "0.3.0",
          metadata: {},
          contextKind: "project",
          contextLabel: "Design System",
        },
        "user-2",
      ),
    ).toBe("Chen published v0.3.0 of Button");
  });

  it("special-cases visibility updates", () => {
    expect(
      activityPrimaryLine(
        {
          id: "activity-2",
          createdAt: "2026-04-10T12:00:00.000Z",
          eventType: "item.metadata_updated",
          actorType: "user",
          actorUserId: "user-1",
          actorName: "Chen",
          actorHandle: "chen",
          resourceType: "registry:ui",
          resourceName: "button",
          resourceTitle: "Button",
          resourceOwnerRef: "chen",
          versionLabel: null,
          metadata: { changedFields: ["visibility"] },
          contextKind: "personal",
          contextLabel: "Personal",
        },
        "user-1",
      ),
    ).toBe("You updated visibility for Button");
  });
});
