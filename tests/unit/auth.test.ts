import request from "supertest";
import { app } from "../../src/index";
import sql from "../../src/config/db";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

describe("Auth Routes", () => {
  let testUsername = "testuser";
  let testUserEmail = "testuser@example.com";
  let testUserPassword = "password123";
  let userId: number;

  beforeAll(async () => {
    // Ensure the test user does not exist
    await sql`DELETE FROM users WHERE email = ${testUserEmail}`;
  });

  afterAll(async () => {
    // Clean up the test user
    await sql`DELETE FROM users WHERE email = ${testUserEmail}`;
  });

  // Test the register route
  it("should register a new user", async () => {
    const response = await request(app).post("/api/auth/register").send({
      username: testUsername,
      email: testUserEmail,
      password: testUserPassword,
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("token");
  });

  // Test registering a user with the same email
  it("should return 409 if user already exists", async () => {
    const response = await request(app).post("/api/auth/register").send({
      username: testUsername,
      email: testUserEmail,
      password: testUserPassword,
    });

    expect(response.status).toBe(409);
  });

  // Test Registering a user with missing fields
  it("should return 400 if missing fields", async () => {
    const response = await request(app).post("/api/auth/register").send({
      username: testUsername,
    });

    expect(response.status).toBe(400);
  });

  // Test login with correct credentials
  it("should login user with correct credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: testUserEmail,
      password: testUserPassword,
    });

    expect(response.status).toBe(200);
  });

  // Test login with incorrect credentials
  it("should return 401 with incorrect credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: testUserEmail,
      password: "wrongpassword",
    });

    expect(response.status).toBe(401);
  });

  // Test for non-existent user
  it("should return 401 if user does not exist", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "nonexistent@example.com",
      password: "password123",
    });

    expect(response.status).toBe(401);
  });
});
