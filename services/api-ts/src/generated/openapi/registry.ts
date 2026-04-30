/**
 * Handler registry - maps operationIds to handler functions
 * This file is regenerated on each run
 */

import { listAuditLogs } from '../../handlers/audit/listAuditLogs';
import { createInvoice } from '../../handlers/billing/createInvoice';
import { listInvoices } from '../../handlers/billing/listInvoices';
import { getInvoice } from '../../handlers/billing/getInvoice';
import { updateInvoice } from '../../handlers/billing/updateInvoice';
import { deleteInvoice } from '../../handlers/billing/deleteInvoice';
import { captureInvoicePayment } from '../../handlers/billing/captureInvoicePayment';
import { finalizeInvoice } from '../../handlers/billing/finalizeInvoice';
import { markInvoiceUncollectible } from '../../handlers/billing/markInvoiceUncollectible';
import { payInvoice } from '../../handlers/billing/payInvoice';
import { refundInvoicePayment } from '../../handlers/billing/refundInvoicePayment';
import { voidInvoice } from '../../handlers/billing/voidInvoice';
import { createMerchantAccount } from '../../handlers/billing/createMerchantAccount';
import { getMerchantAccount } from '../../handlers/billing/getMerchantAccount';
import { getMerchantDashboard } from '../../handlers/billing/getMerchantDashboard';
import { onboardMerchantAccount } from '../../handlers/billing/onboardMerchantAccount';
import { handleStripeWebhook } from '../../handlers/billing/handleStripeWebhook';
import { createBooking } from '../../handlers/booking/createBooking';
import { listBookings } from '../../handlers/booking/listBookings';
import { getBooking } from '../../handlers/booking/getBooking';
import { cancelBooking } from '../../handlers/booking/cancelBooking';
import { confirmBooking } from '../../handlers/booking/confirmBooking';
import { markNoShowBooking } from '../../handlers/booking/markNoShowBooking';
import { rejectBooking } from '../../handlers/booking/rejectBooking';
import { listBookingEvents } from '../../handlers/booking/listBookingEvents';
import { createBookingEvent } from '../../handlers/booking/createBookingEvent';
import { getBookingEvent } from '../../handlers/booking/getBookingEvent';
import { updateBookingEvent } from '../../handlers/booking/updateBookingEvent';
import { deleteBookingEvent } from '../../handlers/booking/deleteBookingEvent';
import { createScheduleException } from '../../handlers/booking/createScheduleException';
import { listScheduleExceptions } from '../../handlers/booking/listScheduleExceptions';
import { getScheduleException } from '../../handlers/booking/getScheduleException';
import { deleteScheduleException } from '../../handlers/booking/deleteScheduleException';
import { listEventSlots } from '../../handlers/booking/listEventSlots';
import { getTimeSlot } from '../../handlers/booking/getTimeSlot';
import { createChatRoom } from '../../handlers/comms/createChatRoom';
import { listChatRooms } from '../../handlers/comms/listChatRooms';
import { getChatRoom } from '../../handlers/comms/getChatRoom';
import { getChatMessages } from '../../handlers/comms/getChatMessages';
import { sendChatMessage } from '../../handlers/comms/sendChatMessage';
import { endVideoCall } from '../../handlers/comms/endVideoCall';
import { joinVideoCall } from '../../handlers/comms/joinVideoCall';
import { leaveVideoCall } from '../../handlers/comms/leaveVideoCall';
import { updateVideoCallParticipant } from '../../handlers/comms/updateVideoCallParticipant';
import { getIceServers } from '../../handlers/comms/getIceServers';
import { listEmailQueueItems } from '../../handlers/email/listEmailQueueItems';
import { getEmailQueueItem } from '../../handlers/email/getEmailQueueItem';
import { cancelEmailQueueItem } from '../../handlers/email/cancelEmailQueueItem';
import { retryEmailQueueItem } from '../../handlers/email/retryEmailQueueItem';
import { listEmailTemplates } from '../../handlers/email/listEmailTemplates';
import { createEmailTemplate } from '../../handlers/email/createEmailTemplate';
import { getEmailTemplate } from '../../handlers/email/getEmailTemplate';
import { updateEmailTemplate } from '../../handlers/email/updateEmailTemplate';
import { testEmailTemplate } from '../../handlers/email/testEmailTemplate';
import { listNotifications } from '../../handlers/notifs/listNotifications';
import { markAllNotificationsAsRead } from '../../handlers/notifs/markAllNotificationsAsRead';
import { getNotification } from '../../handlers/notifs/getNotification';
import { markNotificationAsRead } from '../../handlers/notifs/markNotificationAsRead';
import { createPerson } from '../../handlers/person/createPerson';
import { listPersons } from '../../handlers/person/listPersons';
import { getPerson } from '../../handlers/person/getPerson';
import { updatePerson } from '../../handlers/person/updatePerson';
import { createReview } from '../../handlers/reviews/createReview';
import { listReviews } from '../../handlers/reviews/listReviews';
import { getReview } from '../../handlers/reviews/getReview';
import { deleteReview } from '../../handlers/reviews/deleteReview';
import { listFiles } from '../../handlers/storage/listFiles';
import { uploadFile } from '../../handlers/storage/uploadFile';
import { getFile } from '../../handlers/storage/getFile';
import { deleteFile } from '../../handlers/storage/deleteFile';
import { completeFileUpload } from '../../handlers/storage/completeFileUpload';
import { getFileDownload } from '../../handlers/storage/getFileDownload';

export const registry = {
  // Audit handlers
  listAuditLogs,

  // Billing handlers
  createInvoice,
  listInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  captureInvoicePayment,
  finalizeInvoice,
  markInvoiceUncollectible,
  payInvoice,
  refundInvoicePayment,
  voidInvoice,
  createMerchantAccount,
  getMerchantAccount,
  getMerchantDashboard,
  onboardMerchantAccount,
  handleStripeWebhook,

  // Booking handlers
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
  confirmBooking,
  markNoShowBooking,
  rejectBooking,
  listBookingEvents,
  createBookingEvent,
  getBookingEvent,
  updateBookingEvent,
  deleteBookingEvent,
  createScheduleException,
  listScheduleExceptions,
  getScheduleException,
  deleteScheduleException,
  listEventSlots,
  getTimeSlot,

  // Comms handlers
  createChatRoom,
  listChatRooms,
  getChatRoom,
  getChatMessages,
  sendChatMessage,
  endVideoCall,
  joinVideoCall,
  leaveVideoCall,
  updateVideoCallParticipant,
  getIceServers,

  // Email handlers
  listEmailQueueItems,
  getEmailQueueItem,
  cancelEmailQueueItem,
  retryEmailQueueItem,
  listEmailTemplates,
  createEmailTemplate,
  getEmailTemplate,
  updateEmailTemplate,
  testEmailTemplate,

  // Notifs handlers
  listNotifications,
  markAllNotificationsAsRead,
  getNotification,
  markNotificationAsRead,

  // Person handlers
  createPerson,
  listPersons,
  getPerson,
  updatePerson,

  // Reviews handlers
  createReview,
  listReviews,
  getReview,
  deleteReview,

  // Storage handlers
  listFiles,
  uploadFile,
  getFile,
  deleteFile,
  completeFileUpload,
  getFileDownload,

};