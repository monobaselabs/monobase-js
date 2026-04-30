# Testing Guide

## Overview

This document describes testing patterns and best practices for the Monobase API service.

## Test Isolation for Parallel Execution

### The Problem

Bun test runner executes tests in parallel by default. Tests that share state or assume they're the only ones accessing the database will fail unpredictably due to data leakage between tests.

**Common symptoms:**
- Tests pass individually but fail when run together
- Flaky tests that sometimes pass, sometimes fail
- Assertion errors like `expect(data.length).toBe(1)` when you get 5 results
- Tests finding data they didn't create

### The Solution: Complete Test Isolation

Each test must be completely isolated:

1. **Create its own authenticated clients** - Never share clients between tests
2. **Create its own test data** - Events, bookings, users, etc.
3. **Use data-aware assertions** - Verify YOUR data exists, not that ALL data matches

## Data-Aware Assertions Pattern

### ❌ Wrong: Assumes ALL data matches your filter

```typescript
test('should filter by owner', async () => {
  const provider = await createAuthenticatedClient(testApp.app);
  await createBookingEvent(provider, eventData);
  
  const { data } = await listBookingEvents(apiClient, {
    owner: provider.currentUser!.id
  });
  
  // WRONG: This assumes ALL events in DB belong to this provider
  // Fails when other parallel tests create events
  data.forEach(event => {
    expect(event.owner).toBe(provider.currentUser!.id);
  });
});
```

**Why this fails:** Other tests running in parallel also create events. Your query returns:
- Your event (owner: provider-123)
- Another test's event (owner: provider-456) ← Causes failure!

### ✅ Correct: Verify YOUR data exists

```typescript
test('should filter by owner', async () => {
  const provider = await createAuthenticatedClient(testApp.app);
  const createdEvent = await createBookingEvent(provider, eventData);
  
  const { data } = await listBookingEvents(apiClient, {
    owner: provider.currentUser!.id
  });
  
  // CORRECT: Verify OUR event exists in results
  expect(data.length).toBeGreaterThan(0);
  const ourEvent = data.find(e => e.id === createdEvent.id);
  expect(ourEvent).toBeDefined();
  expect(ourEvent!.owner).toBe(provider.currentUser!.id);
  
  // Optional: Verify isolation - other test's data NOT in results
  const otherTestData = data.find(e => e.id === someOtherId);
  expect(otherTestData).toBeUndefined();
});
```

**Why this works:** We only assert on data WE created, not ALL data in the database.

## Test Structure Pattern

### Template for Isolated Tests

```typescript
test('should do something', async () => {
  // 1. Create your own clients
  const providerClient = await createAuthenticatedClient(testApp.app);
  const clientClient = await createAuthenticatedClient(testApp.app);
  
  // 2. Create your own test data
  const event = await createBookingEvent(providerClient, generateTestEventData());
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for slots
  
  const { data: slots } = await listEventSlots(apiClient, event.id);
  const slot = slots.find(s => s.status === 'available');
  
  const booking = await createBooking(clientClient, {
    slot: slot!.id,
    reason: 'Test booking'
  });
  
  // 3. Perform the action
  const { data } = await getBooking(clientClient, booking.id);
  
  // 4. Use data-aware assertions
  expect(data).toBeDefined();
  expect(data!.id).toBe(booking.id);
  expect(data!.client).toBe(clientClient.currentUser!.id);
});
```

### When to Use beforeAll vs Per-Test Setup

#### Use beforeAll for:
- Expensive one-time setup (test app initialization)
- Shared read-only data that doesn't change
- Data that won't interfere with other tests

#### Use per-test setup for:
- Clients (always create per-test)
- Data that will be modified (bookings, events, users)
- Data used in assertions

**Example with beforeAll:**

```typescript
describe('Booking Management', () => {
  let testApp: TestApp;
  
  beforeAll(async () => {
    testApp = await createTestApp();
  }, 30000);
  
  test('should create booking', async () => {
    // Each test creates its own clients and data
    const providerClient = await createAuthenticatedClient(testApp.app);
    const clientClient = await createAuthenticatedClient(testApp.app);
    // ... rest of test
  });
  
  test('should cancel booking', async () => {
    // Don't reuse clients or data from previous test!
    const providerClient = await createAuthenticatedClient(testApp.app);
    const clientClient = await createAuthenticatedClient(testApp.app);
    // ... rest of test
  });
});
```

## Common Pitfalls

### 1. Reusing Clients Between Tests

❌ **Wrong:**
```typescript
let sharedClient: ApiClient; // Global state!

beforeAll(async () => {
  sharedClient = await createAuthenticatedClient(testApp.app);
});

test('test 1', async () => {
  await doSomething(sharedClient); // Pollutes shared state
});

test('test 2', async () => {
  await doSomething(sharedClient); // Affected by test 1
});
```

✅ **Correct:**
```typescript
test('test 1', async () => {
  const client = await createAuthenticatedClient(testApp.app);
  await doSomething(client);
});

test('test 2', async () => {
  const client = await createAuthenticatedClient(testApp.app);
  await doSomething(client);
});
```

### 2. Asserting on ALL Results

❌ **Wrong:**
```typescript
const { data } = await listBookings(client);
expect(data.length).toBe(1); // Fails when other tests create bookings
```

✅ **Correct:**
```typescript
const booking = await createBooking(client, bookingData);
const { data } = await listBookings(client);
const ourBooking = data.find(b => b.id === booking.id);
expect(ourBooking).toBeDefined();
```

### 3. Expecting Empty Results

❌ **Wrong:**
```typescript
const { data } = await listBookings(otherClient);
expect(data.length).toBe(0); // Fails when other tests run
```

✅ **Correct:**
```typescript
const ourBookingId = 'booking-we-created';
const { data } = await listBookings(otherClient);
const leakedBooking = data.find(b => b.id === ourBookingId);
expect(leakedBooking).toBeUndefined(); // Verify OUR data not leaked
```

## Database Considerations

### No Cleanup Required

With proper data-aware assertions, you don't need to clean up after tests:

```typescript
// ❌ NOT NEEDED with data-aware assertions
afterEach(async () => {
  await cleanupDatabase(); // Slow and unnecessary
});

// ✅ Just use data-aware assertions instead
test('test', async () => {
  const myData = await createData();
  const results = await queryData();
  const myResult = results.find(r => r.id === myData.id);
  expect(myResult).toBeDefined();
});
```

### Why No Cleanup?

1. **Performance**: Cleanup is slow
2. **Simplicity**: Less code to maintain
3. **Safety**: Can't accidentally delete other tests' data
4. **Real-world**: Tests database state more realistically

## Testing Checklist

Before committing tests, verify:

- [ ] Each test creates its own authenticated clients
- [ ] No shared state between tests (no global variables)
- [ ] Assertions use `.find()` to locate specific data you created
- [ ] No assertions on `data.length` or `.forEach()` over all results
- [ ] Tests pass when run individually AND in parallel
- [ ] No `beforeAll` that creates shared mutable data

## Example: Complete Isolated Test

```typescript
describe('Booking Isolation Example', () => {
  let testApp: TestApp;
  
  beforeAll(async () => {
    testApp = await createTestApp();
  }, 30000);
  
  test('client can only see their own bookings', async () => {
    // Setup: Create two separate clients
    const client1 = await createAuthenticatedClient(testApp.app);
    const client2 = await createAuthenticatedClient(testApp.app);
    const provider = await createAuthenticatedClient(testApp.app);
    
    // Create provider's event and wait for slots
    const event = await createBookingEvent(provider, generateTestEventData());
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get available slots
    const { data: slots } = await listEventSlots(testApp.app, event.id);
    const slot1 = slots[0];
    const slot2 = slots[1];
    
    // Each client creates a booking
    const booking1 = await createBooking(client1, { slot: slot1.id, reason: 'Client 1' });
    const booking2 = await createBooking(client2, { slot: slot2.id, reason: 'Client 2' });
    
    // Client 1 lists their bookings
    const { data: client1Results } = await listBookings(client1);
    
    // Data-aware assertions: Verify OUR booking exists
    const client1Booking = client1Results.find(b => b.id === booking1.id);
    expect(client1Booking).toBeDefined();
    expect(client1Booking!.client).toBe(client1.currentUser!.id);
    
    // Data-aware isolation: Verify OTHER client's booking NOT in results
    const leakedBooking = client1Results.find(b => b.id === booking2.id);
    expect(leakedBooking).toBeUndefined();
    
    // Client 2 lists their bookings
    const { data: client2Results } = await listBookings(client2);
    
    // Verify client2's booking exists
    const client2Booking = client2Results.find(b => b.id === booking2.id);
    expect(client2Booking).toBeDefined();
    
    // Verify client1's booking NOT leaked to client2
    const leakedToClient2 = client2Results.find(b => b.id === booking1.id);
    expect(leakedToClient2).toBeUndefined();
  });
});
```

## Further Reading

- [Bun Test Documentation](https://bun.sh/docs/cli/test)
- [Test Isolation Patterns](https://martinfowler.com/articles/test-isolation.html)
- See `tests/e2e/booking/booking.test.ts` for more examples
