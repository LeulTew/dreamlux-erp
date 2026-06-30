import { describe, test, expect, beforeAll, mock } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../index";
import "./setup"; // Imports mocks for supabase/pg/other tools

// Intercept pg pool to return mocked responses for our notification tables
import { NotificationsService } from "../services/notifications-service";
import { pool } from "../db/pool";

const testUserId = "550e8400-e29b-41d4-a716-446655440000";
const anotherUserId = "550e8400-e29b-41d4-a716-446655440001";
const mockNotificationId = "550e8400-e29b-41d4-a716-446655449999";

const mockNotifications = [
  {
    id: mockNotificationId,
    recipient_id: testUserId,
    actor_id: anotherUserId,
    title: "Test Alert",
    message: "This is a test notification",
    entity_type: "proposal",
    entity_id: "550e8400-e29b-41d4-a716-446655440002",
    action_url: "/events/proposals/2",
    read_at: null,
    archived_at: null,
    created_at: new Date().toISOString(),
    actor_name: "Test Actor",
    actor_username: "testactor",
  },
];

const mockPreferences = {
  user_id: testUserId,
  in_app_enabled: true,
  email_enabled: true,
  push_enabled: false,
  categories: { proposals: true, events: true, expenses: true, payroll: true, inventory: true, employees: true },
};

// Override pool.query with custom mock logic
pool.query = mock((sql: string, params?: any[]) => {
  const queryLower = sql.toLowerCase();

  // Mock notification recipient fanout. The SQL intentionally supports primary role_id plus optional role_ids.
  if (queryLower.includes("with user_roles") || queryLower.includes("select distinct u.id, lower(r.name)")) {
    return Promise.resolve({
      rows: [
        {
          id: testUserId,
          role_name: "admin",
          permissions: {},
          slugs: ["*"],
        },
        {
          id: anotherUserId,
          role_name: "event_manager",
          permissions: { events: ["read"] },
          slugs: ["events:read"],
        },
      ],
    });
  }

  if (queryLower.includes("where lower(r.name) = lower")) {
    return Promise.resolve({ rows: [{ id: testUserId }, { id: anotherUserId }] });
  }

  // Mock notifications list
  if (queryLower.includes("select n.*")) {
    if (params && params[0] === testUserId) {
      return Promise.resolve({ rows: mockNotifications });
    }
    return Promise.resolve({ rows: [] });
  }

  // Mock notifications count
  if (queryLower.includes("select count(*) as total")) {
    return Promise.resolve({ rows: [{ total: mockNotifications.length }] });
  }

  // Mock unread count
  if (queryLower.includes("unread_count")) {
    const unread = mockNotifications.filter((n) => !n.read_at).length;
    return Promise.resolve({ rows: [{ unread_count: unread }] });
  }

  // Mock preferences fetch
  if (queryLower.includes("select in_app_enabled")) {
    if (params?.[0] === "disabled-proposal-user") {
      return Promise.resolve({
        rows: [
          {
            ...mockPreferences,
            categories: { proposals: false, events: true },
          },
        ],
      });
    }
    return Promise.resolve({ rows: [mockPreferences] });
  }

  // Mock single user resolve
  if (queryLower.includes("u.id") || queryLower.includes("users")) {
    return Promise.resolve({ rows: [{ id: testUserId }] });
  }

  // Mock update/insert operations
  if (queryLower.includes("insert into public.notifications") || queryLower.includes("update public.notifications")) {
    return Promise.resolve({ rows: [mockNotifications[0]], rowCount: 1 });
  }

  if (queryLower.includes("insert into public.notification_preferences")) {
    return Promise.resolve({ rows: [mockPreferences], rowCount: 1 });
  }

  return Promise.resolve({ rows: [], rowCount: 0 });
}) as any;

// Helper to generate auth tokens
function getTestToken(userId: string, role = "admin", permissions = ["*"]): string {
  const secret = process.env.JWT_SECRET || "test-secret";
  return jwt.sign(
    {
      id: userId,
      username: "testuser",
      role: role,
      permission_slugs: permissions,
    },
    secret
  );
}

describe("Notifications API & Matrix triggers", () => {
  let superAdminToken: string;

  beforeAll(() => {
    superAdminToken = getTestToken(testUserId, "admin", ["*"]);
  });

  test("GET /api/notifications requires authentication", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  test("GET /api/notifications returns user's notifications successfully", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("notifications");
    expect(res.body.notifications.length).toBe(1);
    expect(res.body.notifications[0].title).toBe("Test Alert");
  });

  test("GET /api/notifications/unread-count fetches unread count", async () => {
    const res = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("unread_count");
    expect(res.body.unread_count).toBe(1);
  });

  test("PATCH /api/notifications/:id/read marks notification as read", async () => {
    const res = await request(app)
      .patch(`/api/notifications/${mockNotificationId}/read`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  test("POST /api/notifications/mark-all-read marks all read", async () => {
    const res = await request(app)
      .post("/api/notifications/mark-all-read")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  test("GET /api/notifications/preferences fetches user preferences", async () => {
    const res = await request(app)
      .get("/api/notifications/preferences")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("in_app_enabled", true);
  });

  test("PUT /api/notifications/preferences updates user preferences", async () => {
    const res = await request(app)
      .put("/api/notifications/preferences")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        in_app_enabled: false,
        categories: { proposals: false, events: true },
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  test("PUT /api/notifications/preferences rejects non-boolean category values", async () => {
    const res = await request(app)
      .put("/api/notifications/preferences")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        categories: { proposals: "no" },
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Invalid notification preferences payload");
  });

  test("NotificationsService.emitNotificationToRoleOrPermission triggers role broadcast", async () => {
    // Direct call verification
    const success = await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "users:manage",
      title: "Security Change Alert",
      message: "Role permissions changed",
      entity_type: "security",
    });
    expect(success).toBeGreaterThan(0);
  });

  test("NotificationsService excludes actor from broad fanout by default", async () => {
    const success = await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "events:read",
      actor_id: testUserId,
      title: "Event Updated",
      message: "Event details changed",
      entity_type: "event",
    });
    expect(success).toBe(1);
  });

  test("NotificationsService can include actor when a workflow needs self-visible audit notice", async () => {
    const success = await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "events:read",
      actor_id: testUserId,
      include_actor: true,
      title: "Event Updated",
      message: "Event details changed",
      entity_type: "event",
    });
    expect(success).toBe(2);
  });

  test("NotificationsService maps singular entity type to plural preference category", async () => {
    const success = await NotificationsService.createNotification({
      recipient_id: "disabled-proposal-user",
      title: "Proposal Updated",
      message: "Proposal changed",
      entity_type: "proposal",
    });
    expect(success).toBe(false);
  });

  test("NotificationsService records system actor snapshots for workflow-generated events", async () => {
    const success = await NotificationsService.createNotification({
      recipient_id: testUserId,
      actor_type: "system",
      actor_display_name: "System",
      actor_username: "system",
      title: "Proposal Converted",
      message: "A proposal was converted into an event",
      entity_type: "event",
    });
    expect(success).toBe(true);
  });
});
