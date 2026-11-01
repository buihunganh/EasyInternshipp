// Turns Supabase / PostgREST / network errors into one AppError with a Vietnamese message.
import { toast } from './ui/feedback';

export class AppError extends Error {
  constructor(message: string, readonly code?: string, readonly cause?: unknown) { super(message); }
}

interface PgLike { message?: string; code?: string; status?: number; details?: string }

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as PgLike;
  const code = e.code;
  if (error instanceof TypeError || /Failed to fetch|NetworkError|fetch failed/i.test(e.message || '')) {
    return new AppError('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.', 'network', error);
  }
  // Business-rule errors raised by the database are already written in Vietnamese
  if (code === 'P0001' || code === 'P0002') return new AppError(e.message || 'Thao tác không hợp lệ', code, error);
  if (code === '42501' || e.status === 401 || e.status === 403) {
    return new AppError(/[À-ỹ]/.test(e.message || '') ? e.message! : 'Bạn không có quyền thực hiện thao tác này.', '42501', error);
  }
  if (code === '23505') return new AppError('Dữ liệu này đã tồn tại.', code, error);
  if (code === '23514' || code === '22P02') return new AppError('Dữ liệu nhập chưa hợp lệ, vui lòng kiểm tra lại.', code, error);
  if (code === 'PGRST116') return new AppError('Không tìm thấy dữ liệu.', code, error);
  const auth = authMessage(e.message || '');
  if (auth) return new AppError(auth, 'auth', error);
  return new AppError(e.message || 'Đã có lỗi xảy ra, vui lòng thử lại.', code, error);
}

function authMessage(message: string) {
  if (/Invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu không đúng.';
  if (/User already registered/i.test(message)) return 'Email này đã được đăng ký. Vui lòng đăng nhập.';
  if (/Password should be at least/i.test(message)) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (/Email not confirmed/i.test(message)) return 'Vui lòng xác nhận email trước khi đăng nhập.';
  if (/rate limit|too many/i.test(message)) return 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.';
  if (/Unable to validate email|invalid format/i.test(message)) return 'Email không hợp lệ.';
  return '';
}

/** Throw an AppError if a Supabase result has an error; otherwise return its (non-null) data. */
export function unwrap<R extends { data: unknown; error: unknown }>(result: R): NonNullable<R['data']> {
  if (result.error) throw toAppError(result.error);
  return result.data as NonNullable<R['data']>;
}

/** Like unwrap, for `.maybeSingle()` queries where "no row" is a valid answer. */
export function unwrapMaybe<R extends { data: unknown; error: unknown }>(result: R): NonNullable<R['data']> | null {
  if (result.error) throw toAppError(result.error);
  return (result.data ?? null) as NonNullable<R['data']> | null;
}

/** Show an error as a toast (or inside `target` when given). */
export function showError(error: unknown, target?: HTMLElement | null) {
  const message = toAppError(error).message;
  if (target) { target.textContent = message; target.hidden = false; target.setAttribute('role', 'alert'); }
  else toast(message);
  if (!(error instanceof AppError)) console.error(error);
}
