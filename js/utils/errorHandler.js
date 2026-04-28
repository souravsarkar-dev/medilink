// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Error Handler Utility
// ═══════════════════════════════════════════════════════════════════

export function handleError(error, context = '') {
  console.error(`🔴 [Error] ${context}:`, error.message || error);
  
  // Map Firebase auth error codes to user-friendly messages
  const errorMessages = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
    'auth/popup-blocked': 'Pop-up was blocked by your browser. Please allow pop-ups for this site.',
    'auth/cancelled-popup-request': 'Only one sign-in window can be open at a time.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/invalid-phone-number': 'Please enter a valid 10-digit Indian mobile number.',
    'auth/invalid-verification-code': 'Invalid OTP. Please check and try again.',
    'auth/code-expired': 'OTP has expired. Please request a new one.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
    'auth/internal-error': 'Authentication service error. Please try again later.',
  };
  
  const code = error?.code || '';
  const userMessage = errorMessages[code] || error?.message || 'An unexpected error occurred. Please try again.';
  
  return { userMessage, code, originalError: error };
}

export function showErrorToast(error, context = '') {
  handleError(error, context);
  const msg = typeof error === 'string' ? error : error.message || 'An unexpected error occurred';
  if (window.showToast) {
    window.showToast(msg, 'error');
  } else {
    console.warn('Toast fallback:', msg);
  }
}
