import type { Hono, Handler } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Variables } from '@/types/app';
import * as validators from './validators';
import { registry } from './registry';
import { authMiddleware } from '@/middleware/auth';
import { validationErrorHandler } from '@/middleware/validation';
import { createExpandMiddleware } from '@/middleware/expand';

export function registerRoutes(app: Hono<{ Variables: Variables }>) {
  // listAuditLogs
  app.get('/audit/logs',
    authMiddleware({ roles: ["admin", "support"] }),
    zValidator('query', validators.ListAuditLogsQuery, validationErrorHandler),
    registry.listAuditLogs as unknown as Handler
  );

  // createInvoice
  app.post('/billing/invoices',
    authMiddleware(),
    zValidator('json', validators.CreateInvoiceBody, validationErrorHandler),
    createExpandMiddleware("Invoice"),
    registry.createInvoice as unknown as Handler
  );

  // listInvoices
  app.get('/billing/invoices',
    authMiddleware(),
    zValidator('query', validators.ListInvoicesQuery, validationErrorHandler),
    registry.listInvoices as unknown as Handler
  );

  // getInvoice
  app.get('/billing/invoices/:invoice',
    authMiddleware(),
    zValidator('param', validators.GetInvoiceParams, validationErrorHandler),
    zValidator('query', validators.GetInvoiceQuery, validationErrorHandler),
    createExpandMiddleware("Invoice"),
    registry.getInvoice as unknown as Handler
  );

  // updateInvoice
  app.patch('/billing/invoices/:invoice',
    authMiddleware(),
    zValidator('param', validators.UpdateInvoiceParams, validationErrorHandler),
    zValidator('json', validators.UpdateInvoiceBody, validationErrorHandler),
    createExpandMiddleware("Invoice"),
    registry.updateInvoice as unknown as Handler
  );

  // deleteInvoice
  app.delete('/billing/invoices/:invoice',
    authMiddleware(),
    zValidator('param', validators.DeleteInvoiceParams, validationErrorHandler),
    registry.deleteInvoice as unknown as Handler
  );

  // captureInvoicePayment
  app.post('/billing/invoices/:invoice/capture',
    authMiddleware(),
    zValidator('param', validators.CaptureInvoicePaymentParams, validationErrorHandler),
    createExpandMiddleware("Invoice"),
    registry.captureInvoicePayment as unknown as Handler
  );

  // finalizeInvoice
  app.post('/billing/invoices/:invoice/finalize',
    authMiddleware(),
    zValidator('param', validators.FinalizeInvoiceParams, validationErrorHandler),
    createExpandMiddleware("Invoice"),
    registry.finalizeInvoice as unknown as Handler
  );

  // markInvoiceUncollectible
  app.post('/billing/invoices/:invoice/mark-uncollectible',
    authMiddleware(),
    zValidator('param', validators.MarkInvoiceUncollectibleParams, validationErrorHandler),
    createExpandMiddleware("Invoice"),
    registry.markInvoiceUncollectible as unknown as Handler
  );

  // payInvoice
  app.post('/billing/invoices/:invoice/pay',
    authMiddleware(),
    zValidator('param', validators.PayInvoiceParams, validationErrorHandler),
    zValidator('json', validators.PayInvoiceBody, validationErrorHandler),
    registry.payInvoice as unknown as Handler
  );

  // refundInvoicePayment
  app.post('/billing/invoices/:invoice/refund',
    authMiddleware(),
    zValidator('param', validators.RefundInvoicePaymentParams, validationErrorHandler),
    zValidator('json', validators.RefundInvoicePaymentBody, validationErrorHandler),
    registry.refundInvoicePayment as unknown as Handler
  );

  // voidInvoice
  app.post('/billing/invoices/:invoice/void',
    authMiddleware(),
    zValidator('param', validators.VoidInvoiceParams, validationErrorHandler),
    createExpandMiddleware("Invoice"),
    registry.voidInvoice as unknown as Handler
  );

  // createMerchantAccount
  app.post('/billing/merchant-accounts',
    authMiddleware(),
    zValidator('json', validators.CreateMerchantAccountBody, validationErrorHandler),
    createExpandMiddleware("MerchantAccount"),
    registry.createMerchantAccount as unknown as Handler
  );

  // getMerchantAccount
  app.get('/billing/merchant-accounts/:merchantAccount',
    authMiddleware(),
    zValidator('param', validators.GetMerchantAccountParams, validationErrorHandler),
    zValidator('query', validators.GetMerchantAccountQuery, validationErrorHandler),
    createExpandMiddleware("MerchantAccount"),
    registry.getMerchantAccount as unknown as Handler
  );

  // getMerchantDashboard
  app.post('/billing/merchant-accounts/:merchantAccount/dashboard',
    authMiddleware(),
    zValidator('param', validators.GetMerchantDashboardParams, validationErrorHandler),
    registry.getMerchantDashboard as unknown as Handler
  );

  // onboardMerchantAccount
  app.post('/billing/merchant-accounts/:merchantAccount/onboard',
    authMiddleware(),
    zValidator('param', validators.OnboardMerchantAccountParams, validationErrorHandler),
    zValidator('json', validators.OnboardMerchantAccountBody, validationErrorHandler),
    registry.onboardMerchantAccount as unknown as Handler
  );

  // handleStripeWebhook
  app.post('/billing/webhooks/stripe',
    zValidator('json', validators.HandleStripeWebhookBody, validationErrorHandler),
    registry.handleStripeWebhook as unknown as Handler
  );

  // createBooking
  app.post('/booking/bookings',
    authMiddleware({ roles: ["user"] }),
    zValidator('json', validators.CreateBookingBody, validationErrorHandler),
    createExpandMiddleware("Booking"),
    registry.createBooking as unknown as Handler
  );

  // listBookings
  app.get('/booking/bookings',
    authMiddleware({ roles: ["client:owner", "host:owner", "admin", "support"] }),
    zValidator('query', validators.ListBookingsQuery, validationErrorHandler),
    registry.listBookings as unknown as Handler
  );

  // getBooking
  app.get('/booking/bookings/:booking',
    authMiddleware({ roles: ["client:owner", "host:owner", "admin", "support"] }),
    zValidator('param', validators.GetBookingParams, validationErrorHandler),
    zValidator('query', validators.GetBookingQuery, validationErrorHandler),
    createExpandMiddleware("Booking"),
    registry.getBooking as unknown as Handler
  );

  // cancelBooking
  app.post('/booking/bookings/:booking/cancel',
    authMiddleware({ roles: ["client:owner", "host:owner", "admin"] }),
    zValidator('param', validators.CancelBookingParams, validationErrorHandler),
    zValidator('json', validators.CancelBookingBody, validationErrorHandler),
    createExpandMiddleware("Booking"),
    registry.cancelBooking as unknown as Handler
  );

  // confirmBooking
  app.post('/booking/bookings/:booking/confirm',
    authMiddleware({ roles: ["host:owner", "admin"] }),
    zValidator('param', validators.ConfirmBookingParams, validationErrorHandler),
    zValidator('json', validators.ConfirmBookingBody, validationErrorHandler),
    createExpandMiddleware("Booking"),
    registry.confirmBooking as unknown as Handler
  );

  // markNoShowBooking
  app.post('/booking/bookings/:booking/no-show',
    authMiddleware({ roles: ["client:owner", "host:owner", "admin"] }),
    zValidator('param', validators.MarkNoShowBookingParams, validationErrorHandler),
    zValidator('json', validators.MarkNoShowBookingBody, validationErrorHandler),
    createExpandMiddleware("Booking"),
    registry.markNoShowBooking as unknown as Handler
  );

  // rejectBooking
  app.post('/booking/bookings/:booking/reject',
    authMiddleware({ roles: ["host:owner", "admin"] }),
    zValidator('param', validators.RejectBookingParams, validationErrorHandler),
    zValidator('json', validators.RejectBookingBody, validationErrorHandler),
    createExpandMiddleware("Booking"),
    registry.rejectBooking as unknown as Handler
  );

  // listBookingEvents
  app.get('/booking/events',
    authMiddleware({ required: false }),
    zValidator('query', validators.ListBookingEventsQuery, validationErrorHandler),
    registry.listBookingEvents as unknown as Handler
  );

  // createBookingEvent
  app.post('/booking/events',
    authMiddleware({ roles: ["user"] }),
    zValidator('json', validators.CreateBookingEventBody, validationErrorHandler),
    createExpandMiddleware("BookingEvent"),
    registry.createBookingEvent as unknown as Handler
  );

  // getBookingEvent
  app.get('/booking/events/:event',
    authMiddleware({ required: false }),
    zValidator('param', validators.GetBookingEventParams, validationErrorHandler),
    zValidator('query', validators.GetBookingEventQuery, validationErrorHandler),
    createExpandMiddleware("BookingEvent"),
    registry.getBookingEvent as unknown as Handler
  );

  // updateBookingEvent
  app.patch('/booking/events/:event',
    authMiddleware({ roles: ["event:owner", "admin"] }),
    zValidator('param', validators.UpdateBookingEventParams, validationErrorHandler),
    zValidator('json', validators.UpdateBookingEventBody, validationErrorHandler),
    createExpandMiddleware("BookingEvent"),
    registry.updateBookingEvent as unknown as Handler
  );

  // deleteBookingEvent
  app.delete('/booking/events/:event',
    authMiddleware({ roles: ["event:owner", "admin"] }),
    zValidator('param', validators.DeleteBookingEventParams, validationErrorHandler),
    registry.deleteBookingEvent as unknown as Handler
  );

  // createScheduleException
  app.post('/booking/events/:event/exceptions',
    authMiddleware({ roles: ["event:owner", "admin"] }),
    zValidator('param', validators.CreateScheduleExceptionParams, validationErrorHandler),
    zValidator('json', validators.CreateScheduleExceptionBody, validationErrorHandler),
    registry.createScheduleException as unknown as Handler
  );

  // listScheduleExceptions
  app.get('/booking/events/:event/exceptions',
    authMiddleware({ roles: ["event:owner", "admin", "support"] }),
    zValidator('param', validators.ListScheduleExceptionsParams, validationErrorHandler),
    zValidator('query', validators.ListScheduleExceptionsQuery, validationErrorHandler),
    registry.listScheduleExceptions as unknown as Handler
  );

  // getScheduleException
  app.get('/booking/events/:event/exceptions/:exception',
    authMiddleware({ roles: ["event:owner", "admin", "support"] }),
    zValidator('param', validators.GetScheduleExceptionParams, validationErrorHandler),
    registry.getScheduleException as unknown as Handler
  );

  // deleteScheduleException
  app.delete('/booking/events/:event/exceptions/:exception',
    authMiddleware({ roles: ["event:owner", "admin"] }),
    zValidator('param', validators.DeleteScheduleExceptionParams, validationErrorHandler),
    registry.deleteScheduleException as unknown as Handler
  );

  // listEventSlots
  app.get('/booking/events/:event/slots',
    authMiddleware({ required: false }),
    zValidator('param', validators.ListEventSlotsParams, validationErrorHandler),
    zValidator('query', validators.ListEventSlotsQuery, validationErrorHandler),
    registry.listEventSlots as unknown as Handler
  );

  // getTimeSlot
  app.get('/booking/slots/:slotId',
    authMiddleware(),
    zValidator('param', validators.GetTimeSlotParams, validationErrorHandler),
    zValidator('query', validators.GetTimeSlotQuery, validationErrorHandler),
    createExpandMiddleware("TimeSlot"),
    registry.getTimeSlot as unknown as Handler
  );

  // createChatRoom
  app.post('/comms/chat-rooms',
    authMiddleware({ roles: ["user"] }),
    zValidator('json', validators.CreateChatRoomBody, validationErrorHandler),
    registry.createChatRoom as unknown as Handler
  );

  // listChatRooms
  app.get('/comms/chat-rooms',
    authMiddleware({ roles: ["user:participant"] }),
    zValidator('query', validators.ListChatRoomsQuery, validationErrorHandler),
    registry.listChatRooms as unknown as Handler
  );

  // getChatRoom
  app.get('/comms/chat-rooms/:room',
    authMiddleware({ roles: ["user:participant"] }),
    zValidator('param', validators.GetChatRoomParams, validationErrorHandler),
    registry.getChatRoom as unknown as Handler
  );

  // getChatMessages
  app.get('/comms/chat-rooms/:room/messages',
    authMiddleware({ roles: ["user:participant"] }),
    zValidator('param', validators.GetChatMessagesParams, validationErrorHandler),
    zValidator('query', validators.GetChatMessagesQuery, validationErrorHandler),
    registry.getChatMessages as unknown as Handler
  );

  // sendChatMessage
  app.post('/comms/chat-rooms/:room/messages',
    authMiddleware({ roles: ["user:participant"] }),
    zValidator('param', validators.SendChatMessageParams, validationErrorHandler),
    zValidator('json', validators.SendChatMessageBody, validationErrorHandler),
    registry.sendChatMessage as unknown as Handler
  );

  // endVideoCall
  app.post('/comms/chat-rooms/:room/video-call/end',
    authMiddleware({ roles: ["user:admin"] }),
    zValidator('param', validators.EndVideoCallParams, validationErrorHandler),
    registry.endVideoCall as unknown as Handler
  );

  // joinVideoCall
  app.post('/comms/chat-rooms/:room/video-call/join',
    authMiddleware({ roles: ["user:participant"] }),
    zValidator('param', validators.JoinVideoCallParams, validationErrorHandler),
    zValidator('json', validators.JoinVideoCallBody, validationErrorHandler),
    registry.joinVideoCall as unknown as Handler
  );

  // leaveVideoCall
  app.post('/comms/chat-rooms/:room/video-call/leave',
    authMiddleware({ roles: ["user:participant"] }),
    zValidator('param', validators.LeaveVideoCallParams, validationErrorHandler),
    registry.leaveVideoCall as unknown as Handler
  );

  // updateVideoCallParticipant
  app.patch('/comms/chat-rooms/:room/video-call/participant',
    authMiddleware({ roles: ["user:participant"] }),
    zValidator('param', validators.UpdateVideoCallParticipantParams, validationErrorHandler),
    zValidator('json', validators.UpdateVideoCallParticipantBody, validationErrorHandler),
    registry.updateVideoCallParticipant as unknown as Handler
  );

  // getIceServers
  app.get('/comms/ice-servers',
    authMiddleware({ roles: ["user"] }),
    registry.getIceServers as unknown as Handler
  );

  // listEmailQueueItems
  app.get('/email/queue',
    authMiddleware({ roles: ["admin"] }),
    zValidator('query', validators.ListEmailQueueItemsQuery, validationErrorHandler),
    registry.listEmailQueueItems as unknown as Handler
  );

  // getEmailQueueItem
  app.get('/email/queue/:queue',
    authMiddleware({ roles: ["admin"] }),
    zValidator('param', validators.GetEmailQueueItemParams, validationErrorHandler),
    registry.getEmailQueueItem as unknown as Handler
  );

  // cancelEmailQueueItem
  app.post('/email/queue/:queue/cancel',
    authMiddleware({ roles: ["admin"] }),
    zValidator('param', validators.CancelEmailQueueItemParams, validationErrorHandler),
    zValidator('json', validators.CancelEmailQueueItemBody, validationErrorHandler),
    registry.cancelEmailQueueItem as unknown as Handler
  );

  // retryEmailQueueItem
  app.post('/email/queue/:queue/retry',
    authMiddleware({ roles: ["admin"] }),
    zValidator('param', validators.RetryEmailQueueItemParams, validationErrorHandler),
    registry.retryEmailQueueItem as unknown as Handler
  );

  // listEmailTemplates
  app.get('/email/templates',
    authMiddleware({ roles: ["admin"] }),
    zValidator('query', validators.ListEmailTemplatesQuery, validationErrorHandler),
    registry.listEmailTemplates as unknown as Handler
  );

  // createEmailTemplate
  app.post('/email/templates',
    authMiddleware({ roles: ["admin"] }),
    zValidator('json', validators.CreateEmailTemplateBody, validationErrorHandler),
    registry.createEmailTemplate as unknown as Handler
  );

  // getEmailTemplate
  app.get('/email/templates/:template',
    authMiddleware({ roles: ["admin"] }),
    zValidator('param', validators.GetEmailTemplateParams, validationErrorHandler),
    registry.getEmailTemplate as unknown as Handler
  );

  // updateEmailTemplate
  app.patch('/email/templates/:template',
    authMiddleware({ roles: ["admin"] }),
    zValidator('param', validators.UpdateEmailTemplateParams, validationErrorHandler),
    zValidator('json', validators.UpdateEmailTemplateBody, validationErrorHandler),
    registry.updateEmailTemplate as unknown as Handler
  );

  // testEmailTemplate
  app.post('/email/templates/:template/test',
    authMiddleware({ roles: ["admin"] }),
    zValidator('param', validators.TestEmailTemplateParams, validationErrorHandler),
    zValidator('json', validators.TestEmailTemplateBody, validationErrorHandler),
    registry.testEmailTemplate as unknown as Handler
  );

  // listNotifications
  app.get('/notifs',
    authMiddleware({ roles: ["user", "admin"] }),
    zValidator('query', validators.ListNotificationsQuery, validationErrorHandler),
    registry.listNotifications as unknown as Handler
  );

  // markAllNotificationsAsRead
  app.post('/notifs/read-all',
    authMiddleware({ roles: ["user"] }),
    zValidator('query', validators.MarkAllNotificationsAsReadQuery, validationErrorHandler),
    registry.markAllNotificationsAsRead as unknown as Handler
  );

  // getNotification
  app.get('/notifs/:notif',
    authMiddleware({ roles: ["user", "admin"] }),
    zValidator('param', validators.GetNotificationParams, validationErrorHandler),
    registry.getNotification as unknown as Handler
  );

  // markNotificationAsRead
  app.post('/notifs/:notif/read',
    authMiddleware({ roles: ["user"] }),
    zValidator('param', validators.MarkNotificationAsReadParams, validationErrorHandler),
    registry.markNotificationAsRead as unknown as Handler
  );

  // createPerson
  app.post('/persons',
    authMiddleware({ roles: ["user"] }),
    zValidator('json', validators.CreatePersonBody, validationErrorHandler),
    registry.createPerson as unknown as Handler
  );

  // listPersons
  app.get('/persons',
    authMiddleware({ roles: ["admin", "support"] }),
    zValidator('query', validators.ListPersonsQuery, validationErrorHandler),
    registry.listPersons as unknown as Handler
  );

  // getPerson
  app.get('/persons/:person',
    authMiddleware({ roles: ["admin", "support", "user:owner"] }),
    zValidator('param', validators.GetPersonParams, validationErrorHandler),
    registry.getPerson as unknown as Handler
  );

  // updatePerson
  app.patch('/persons/:person',
    authMiddleware({ roles: ["user:owner"] }),
    zValidator('param', validators.UpdatePersonParams, validationErrorHandler),
    zValidator('json', validators.UpdatePersonBody, validationErrorHandler),
    registry.updatePerson as unknown as Handler
  );

  // createReview
  app.post('/reviews/',
    authMiddleware({ roles: ["user"] }),
    zValidator('json', validators.CreateReviewBody, validationErrorHandler),
    registry.createReview as unknown as Handler
  );

  // listReviews
  app.get('/reviews/',
    authMiddleware({ roles: ["user"] }),
    zValidator('query', validators.ListReviewsQuery, validationErrorHandler),
    registry.listReviews as unknown as Handler
  );

  // getReview
  app.get('/reviews/:review',
    authMiddleware({ roles: ["user"] }),
    zValidator('param', validators.GetReviewParams, validationErrorHandler),
    registry.getReview as unknown as Handler
  );

  // deleteReview
  app.delete('/reviews/:review',
    authMiddleware({ roles: ["review:owner", "admin"] }),
    zValidator('param', validators.DeleteReviewParams, validationErrorHandler),
    registry.deleteReview as unknown as Handler
  );

  // listFiles
  app.get('/storage/files',
    authMiddleware(),
    zValidator('query', validators.ListFilesQuery, validationErrorHandler),
    registry.listFiles as unknown as Handler
  );

  // uploadFile
  app.post('/storage/files/upload',
    authMiddleware({ roles: ["user"] }),
    zValidator('json', validators.UploadFileBody, validationErrorHandler),
    registry.uploadFile as unknown as Handler
  );

  // getFile
  app.get('/storage/files/:file',
    authMiddleware({ roles: ["admin", "user:owner"] }),
    zValidator('param', validators.GetFileParams, validationErrorHandler),
    registry.getFile as unknown as Handler
  );

  // deleteFile
  app.delete('/storage/files/:file',
    authMiddleware({ roles: ["user:owner"] }),
    zValidator('param', validators.DeleteFileParams, validationErrorHandler),
    registry.deleteFile as unknown as Handler
  );

  // completeFileUpload
  app.post('/storage/files/:file/complete',
    authMiddleware({ roles: ["user:owner"] }),
    zValidator('param', validators.CompleteFileUploadParams, validationErrorHandler),
    registry.completeFileUpload as unknown as Handler
  );

  // getFileDownload
  app.get('/storage/files/:file/download',
    authMiddleware({ roles: ["admin", "user:owner"] }),
    zValidator('param', validators.GetFileDownloadParams, validationErrorHandler),
    registry.getFileDownload as unknown as Handler
  );

}