/**
 * Map raw Firebase Auth errors to friendly AR/EN messages.
 * Users must never see strings like "Hostname match not found (auth/captcha-check-failed)".
 */
export function mapAuthError(err: any, isAr: boolean): string {
  const code: string = err?.code || '';
  const rawMessage: string = err?.message || '';

  switch (code) {
    case 'auth/captcha-check-failed':
      return isAr
        ? 'فشل التحقق الأمني — أعد المحاولة.'
        : 'Security check failed — please try again.';
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return isAr
        ? 'رقم الهاتف غير صالح — أدخل رقماً أردنياً بصيغة 07xxxxxxxx.'
        : 'Invalid phone number — enter a Jordanian number like 07xxxxxxxx.';
    case 'auth/too-many-requests':
      return isAr
        ? 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة.'
        : 'Too many attempts — please wait a moment and try again.';
    case 'auth/code-expired':
      return isAr
        ? 'انتهت صلاحية الرمز — اطلب رمزاً جديداً.'
        : 'The code has expired — request a new one.';
    case 'auth/invalid-verification-code':
      return isAr
        ? 'رمز التحقق غير صحيح — تأكد من الرقم وحاول مجدداً.'
        : 'Incorrect verification code — double-check it and try again.';
    case 'auth/network-request-failed':
      return isAr
        ? 'مشكلة في الاتصال بالإنترنت — تحقق من الشبكة وأعد المحاولة.'
        : 'Network problem — check your connection and try again.';
    default:
      // Some environments surface network failures without a code
      if (/network/i.test(rawMessage)) {
        return isAr
          ? 'مشكلة في الاتصال بالإنترنت — تحقق من الشبكة وأعد المحاولة.'
          : 'Network problem — check your connection and try again.';
      }
      return isAr
        ? 'حدث خطأ غير متوقع — أعد المحاولة بعد لحظات.'
        : 'Something went wrong — please try again in a moment.';
  }
}
