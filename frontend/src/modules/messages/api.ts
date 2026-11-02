// Messaging data access (Phase 8): conversations, realtime message exchange, file attachments,
// interview RSVPs and participant preferences.
import { supabase, signedUrl, type Database, type Enums, type Tables } from '../../core/supabase';
import { toAppError, unwrap } from '../../core/errors';
import { currentRole, currentSession } from '../../core/session';

const uid = () => currentSession()?.user.id ?? '';

async function rpc<T = unknown>(name: keyof Database['public']['Functions'], args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw toAppError(error);
  return data as T;
}

export interface ConversationParticipantProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
  role: Enums<'user_role'>;
}

export interface ConversationItem {
  id: string;
  company_id: string | null;
  application_id: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  company: { id: string; name: string; logo_path: string | null } | null;
  other_user: ConversationParticipantProfile | null;
  is_muted: boolean;
  is_archived: boolean;
  last_read_at: string | null;
  unread_count: number;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: Enums<'message_kind'>;
  body: string | null;
  attachment_name: string | null;
  attachment_path: string | null;
  attachment_size: number | null;
  metadata: Record<string, any>;
  created_at: string;
  sender?: { id: string; full_name: string | null; avatar_path: string | null } | null;
}

export interface ConversationContextData {
  company: {
    id: string;
    name: string;
    slug?: string | null;
    logo_path?: string | null;
    company_size?: string | null;
    address?: string | null;
    city?: string | null;
    industry?: { name: string } | null;
  } | null;
  application: {
    id: string;
    status: Enums<'application_status'>;
    job_id: string;
    job_title: string;
    applied_at: string;
    cv_snapshot: any;
    cv_file_path: string | null;
  } | null;
  student: {
    user_id: string;
    major: string | null;
    graduation_year: number | null;
    gpa: number | null;
    university_name: string | null;
  } | null;
}

export async function listConversations(): Promise<ConversationItem[]> {
  const currentUid = uid();
  if (!currentUid) return [];

  const myParticipants = unwrap(await supabase
    .from('conversation_participants')
    .select('conversation_id, is_muted, is_archived, last_read_at')
    .eq('user_id', currentUid));

  if (!myParticipants.length) return [];
  const convIds = myParticipants.map(p => p.conversation_id);

  const [convsRes, allParticipantsRes] = await Promise.all([
    supabase.from('conversations')
      .select('id, company_id, application_id, created_at, last_message_at, last_message_preview, company:companies(id, name, logo_path)')
      .in('id', convIds)
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase.from('conversation_participants')
      .select('conversation_id, user_id, profile:profiles!conversation_participants_user_id_fkey(id, full_name, email, avatar_path, role)')
      .in('conversation_id', convIds)
      .neq('user_id', currentUid)
  ]);

  const convs = unwrap(convsRes);
  const otherParticipants = unwrap(allParticipantsRes);
  const partMap = new Map<string, typeof myParticipants[number]>();
  myParticipants.forEach(p => partMap.set(p.conversation_id, p));

  const otherMap = new Map<string, ConversationParticipantProfile>();
  otherParticipants.forEach(p => {
    if (p.profile) otherMap.set(p.conversation_id, p.profile as ConversationParticipantProfile);
  });

  const unreadPromises = convs.map(async c => {
    const p = partMap.get(c.id);
    let count = 0;
    if (p?.last_read_at) {
      const { count: cCount } = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .gt('created_at', p.last_read_at)
        .neq('sender_id', currentUid);
      count = cCount ?? 0;
    } else {
      const { count: cCount } = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .neq('sender_id', currentUid);
      count = cCount ?? 0;
    }
    return { id: c.id, count };
  });
  const unreadCounts = await Promise.all(unreadPromises);
  const unreadMap = new Map(unreadCounts.map(u => [u.id, u.count]));

  return convs.map(c => {
    const myPart = partMap.get(c.id);
    return {
      id: c.id,
      company_id: c.company_id,
      application_id: c.application_id,
      created_at: c.created_at,
      last_message_at: c.last_message_at,
      last_message_preview: c.last_message_preview,
      company: c.company as { id: string; name: string; logo_path: string | null } | null,
      other_user: otherMap.get(c.id) ?? null,
      is_muted: myPart?.is_muted ?? false,
      is_archived: myPart?.is_archived ?? false,
      last_read_at: myPart?.last_read_at ?? null,
      unread_count: unreadMap.get(c.id) ?? 0,
    };
  });
}

export async function listMessages(conversationId: string): Promise<MessageItem[]> {
  const rows = unwrap(await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, kind, body, attachment_name, attachment_path, attachment_size, metadata, created_at, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_path)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }));
  return rows.map(r => ({
    ...r,
    metadata: (r.metadata ?? {}) as Record<string, any>,
    sender: r.sender as { id: string; full_name: string | null; avatar_path: string | null } | null,
  }));
}

// sender_id comes from its column default (auth.uid()); clients may not write it (column grants, migration 05)
export async function sendMessage(conversationId: string, body: string) {
  return unwrap(await supabase.from('messages').insert({
    conversation_id: conversationId,
    kind: 'text',
    body,
  }).select().single());
}

export async function uploadMessageAttachment(conversationId: string, file: File) {
  const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-');
  const path = `${conversationId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('message-attachments').upload(path, file, { contentType: file.type });
  if (error) throw toAppError(error);

  return unwrap(await supabase.from('messages').insert({
    conversation_id: conversationId,
    kind: 'file',
    body: file.name,
    attachment_name: file.name,
    attachment_path: path,
    attachment_size: file.size,
  }).select().single());
}

export const messageAttachmentUrl = (path: string) => signedUrl('message-attachments', path);
export const cvSignedUrl = (path: string) => signedUrl('cvs', path);

export async function markConversationRead(conversationId: string) {
  const currentUid = uid();
  if (!currentUid) return;
  unwrap(await supabase.from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', currentUid));
}

export async function setConversationPreference(conversationId: string, pref: { is_muted?: boolean; is_archived?: boolean }) {
  const currentUid = uid();
  unwrap(await supabase.from('conversation_participants')
    .update(pref)
    .eq('conversation_id', conversationId)
    .eq('user_id', currentUid));
}

export function subscribeToMessages(conversationId: string, onNewMessage: (msg: Tables<'messages'>) => void) {
  const channel = supabase.channel(`conversation:${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, payload => {
      onNewMessage(payload.new as Tables<'messages'>);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function getConversationContext(conv: ConversationItem): Promise<ConversationContextData> {
  let companyData: ConversationContextData['company'] = conv.company
    ? { id: conv.company.id, name: conv.company.name, logo_path: conv.company.logo_path }
    : null;

  if (conv.company_id) {
    const { data } = await supabase.from('companies')
      .select('id, name, slug, logo_path, company_size, address, city, industry:industries(name)')
      .eq('id', conv.company_id)
      .maybeSingle();
    if (data) companyData = data;
  }

  let appData: ConversationContextData['application'] = null;
  if (conv.application_id) {
    const { data } = await supabase.from('applications')
      .select('id, status, job_id, cv_snapshot, cv_file_path, applied_at, job:jobs(id, title)')
      .eq('id', conv.application_id)
      .maybeSingle();
    if (data) {
      const job = data.job as { id: string; title: string } | null;
      appData = {
        id: data.id,
        status: data.status,
        job_id: data.job_id,
        job_title: job?.title ?? 'Vị trí thực tập',
        applied_at: data.applied_at,
        cv_snapshot: data.cv_snapshot,
        cv_file_path: data.cv_file_path,
      };
    }
  } else if (conv.other_user && conv.company_id) {
    const studentId = conv.other_user.role === 'student' ? conv.other_user.id : uid();
    const { data } = await supabase.from('applications')
      .select('id, status, job_id, cv_snapshot, cv_file_path, applied_at, job:jobs!inner(id, title, company_id)')
      .eq('student_id', studentId)
      .eq('job.company_id', conv.company_id)
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const job = data.job as { id: string; title: string } | null;
      appData = {
        id: data.id,
        status: data.status,
        job_id: data.job_id,
        job_title: job?.title ?? 'Vị trí thực tập',
        applied_at: data.applied_at,
        cv_snapshot: data.cv_snapshot,
        cv_file_path: data.cv_file_path,
      };
    }
  }

  let studentData: ConversationContextData['student'] = null;
  const studentUid = conv.other_user?.role === 'student' ? conv.other_user.id : (currentRole() === 'student' ? uid() : null);
  if (studentUid) {
    const { data } = await supabase.from('student_profiles')
      .select('user_id, major, graduation_year, gpa, university:universities(name)')
      .eq('user_id', studentUid)
      .maybeSingle();
    if (data) {
      const uni = data.university as { name: string } | null;
      studentData = {
        user_id: data.user_id,
        major: data.major,
        graduation_year: data.graduation_year,
        gpa: data.gpa,
        university_name: uni?.name ?? null,
      };
    }
  }

  return { company: companyData, application: appData, student: studentData };
}

export async function getInterview(interviewId: string) {
  const { data } = await supabase.from('interviews')
    .select('id, round, scheduled_at, duration_minutes, mode, meeting_url, location, status, rsvp, rsvp_note, proposed_at')
    .eq('id', interviewId)
    .maybeSingle();
  return data;
}

export const respondInterview = (interviewId: string, rsvp: Enums<'rsvp_status'>, note?: string, proposedAt?: string) =>
  rpc('respond_interview', {
    p_interview: interviewId,
    p_rsvp: rsvp,
    p_note: note || null,
    p_proposed_at: proposedAt || null,
  });

export const startConversation = (withUser: string, companyId?: string) =>
  rpc<string>('start_conversation', { p_with_user: withUser, p_company: companyId || null });
