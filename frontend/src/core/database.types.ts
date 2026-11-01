export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      application_answers: {
        Row: {
          answer: string
          application_id: string
          passed: boolean | null
          question_id: string
        }
        Insert: {
          answer: string
          application_id: string
          passed?: boolean | null
          question_id: string
        }
        Update: {
          answer?: string
          application_id?: string
          passed?: boolean | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_answers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "screening_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      application_status_history: {
        Row: {
          application_id: string
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["application_status"] | null
          id: number
          note: string | null
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Insert: {
          application_id: string
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: never
          note?: string | null
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Update: {
          application_id?: string
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: never
          note?: string | null
          to_status?: Database["public"]["Enums"]["application_status"]
        }
        Relationships: [
          {
            foreignKeyName: "application_status_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string
          cover_letter: string | null
          cv_file_path: string | null
          cv_id: string | null
          cv_snapshot: Json | null
          hired_at: string | null
          id: string
          job_id: string
          knockout_passed: boolean | null
          rejection_reason: string | null
          score: number | null
          stage_id: string | null
          status: Database["public"]["Enums"]["application_status"]
          status_changed_at: string
          student_id: string
          updated_at: string
          viewed_at: string | null
          withdrawal_reason: string | null
        }
        Insert: {
          applied_at?: string
          cover_letter?: string | null
          cv_file_path?: string | null
          cv_id?: string | null
          cv_snapshot?: Json | null
          hired_at?: string | null
          id?: string
          job_id: string
          knockout_passed?: boolean | null
          rejection_reason?: string | null
          score?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          status_changed_at?: string
          student_id: string
          updated_at?: string
          viewed_at?: string | null
          withdrawal_reason?: string | null
        }
        Update: {
          applied_at?: string
          cover_letter?: string | null
          cv_file_path?: string | null
          cv_id?: string | null
          cv_snapshot?: Json | null
          hired_at?: string | null
          id?: string
          job_id?: string
          knockout_passed?: boolean | null
          rejection_reason?: string | null
          score?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          status_changed_at?: string
          student_id?: string
          updated_at?: string
          viewed_at?: string | null
          withdrawal_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_cv_id_fkey"
            columns: ["cv_id"]
            isOneToOne: false
            referencedRelation: "cvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          created_at: string
          id: number
          ip_address: unknown
          metadata: Json
          reason: string | null
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          id?: never
          ip_address?: unknown
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          id?: never
          ip_address?: unknown
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          company_size: string | null
          cover_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          follower_count: number
          founded_year: number | null
          id: string
          industry_id: number | null
          logo_path: string | null
          name: string
          profile: Json
          slug: string
          tax_code: string | null
          updated_at: string
          verification_note: string | null
          verification_status: Database["public"]["Enums"]["verify_status"]
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_size?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          follower_count?: number
          founded_year?: number | null
          id?: string
          industry_id?: number | null
          logo_path?: string | null
          name: string
          profile?: Json
          slug: string
          tax_code?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_status?: Database["public"]["Enums"]["verify_status"]
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_size?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          follower_count?: number
          founded_year?: number | null
          id?: string
          industry_id?: number | null
          logo_path?: string | null
          name?: string
          profile?: Json
          slug?: string
          tax_code?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_status?: Database["public"]["Enums"]["verify_status"]
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          company_id: string
          created_at: string
          doc_type: string
          file_path: string
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["verify_status"]
          submitted_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          doc_type: string
          file_path: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verify_status"]
          submitted_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          doc_type?: string
          file_path?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verify_status"]
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_follows: {
        Row: {
          company_id: string
          created_at: string
          student_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          student_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_follows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_follows_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_follows_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          department: string | null
          member_role: Database["public"]["Enums"]["company_member_role"]
          position_title: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department?: string | null
          member_role?: Database["public"]["Enums"]["company_member_role"]
          position_title?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department?: string | null
          member_role?: Database["public"]["Enums"]["company_member_role"]
          position_title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          is_archived: boolean
          is_muted: boolean
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          is_archived?: boolean
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          is_archived?: boolean
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          application_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
        }
        Insert: {
          application_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
        }
        Update: {
          application_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cvs: {
        Row: {
          content: Json
          created_at: string
          file_path: string | null
          id: string
          is_default: boolean
          is_public: boolean
          public_slug: string | null
          source: Database["public"]["Enums"]["cv_source"]
          student_id: string
          template: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          file_path?: string | null
          id?: string
          is_default?: boolean
          is_public?: boolean
          public_slug?: string | null
          source?: Database["public"]["Enums"]["cv_source"]
          student_id?: string
          template?: string
          title?: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          file_path?: string | null
          id?: string
          is_default?: boolean
          is_public?: boolean
          public_slug?: string | null
          source?: Database["public"]["Enums"]["cv_source"]
          student_id?: string
          template?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cvs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cvs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          application_id: string
          comment: string | null
          created_at: string
          criteria: Json
          evaluator_id: string | null
          id: string
          interview_id: string | null
          score: number
          updated_at: string
        }
        Insert: {
          application_id: string
          comment?: string | null
          created_at?: string
          criteria?: Json
          evaluator_id?: string | null
          id?: string
          interview_id?: string | null
          score: number
          updated_at?: string
        }
        Update: {
          application_id?: string
          comment?: string | null
          created_at?: string
          criteria?: Json
          evaluator_id?: string | null
          id?: string
          interview_id?: string | null
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      event_booths: {
        Row: {
          booth_label: string | null
          company_id: string
          created_at: string
          event_id: string
          id: string
          note: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          booth_label?: string | null
          company_id: string
          created_at?: string
          event_id: string
          id?: string
          note?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          booth_label?: string | null
          company_id?: string
          created_at?: string
          event_id?: string
          id?: string
          note?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "event_booths_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_booths_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_booths_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_booths_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          checked_in_at: string | null
          created_at: string
          event_id: string
          student_id: string
          ticket_code: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          event_id: string
          student_id: string
          ticket_code?: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          event_id?: string
          student_id?: string
          ticket_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          cover_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          is_virtual: boolean
          location: string | null
          organizer_university_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          is_virtual?: boolean
          location?: string | null
          organizer_university_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          is_virtual?: boolean
          location?: string | null
          organizer_university_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_university_id_fkey"
            columns: ["organizer_university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id?: number
          name: string
          slug: string
        }
        Update: {
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      internship_reports: {
        Row: {
          application_id: string
          certified_at: string | null
          certified_by: string | null
          created_at: string
          employer_comment: string | null
          employer_rating: number | null
          file_path: string | null
          id: string
          review_note: string | null
          status: Database["public"]["Enums"]["cert_status"]
          student_id: string
          student_summary: string | null
          university_id: string | null
          updated_at: string
          verification_code: string | null
        }
        Insert: {
          application_id: string
          certified_at?: string | null
          certified_by?: string | null
          created_at?: string
          employer_comment?: string | null
          employer_rating?: number | null
          file_path?: string | null
          id?: string
          review_note?: string | null
          status?: Database["public"]["Enums"]["cert_status"]
          student_id: string
          student_summary?: string | null
          university_id?: string | null
          updated_at?: string
          verification_code?: string | null
        }
        Update: {
          application_id?: string
          certified_at?: string | null
          certified_by?: string | null
          created_at?: string
          employer_comment?: string | null
          employer_rating?: number | null
          file_path?: string | null
          id?: string
          review_note?: string | null
          status?: Database["public"]["Enums"]["cert_status"]
          student_id?: string
          student_summary?: string | null
          university_id?: string | null
          updated_at?: string
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internship_reports_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_reports_certified_by_fkey"
            columns: ["certified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_reports_certified_by_fkey"
            columns: ["certified_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_reports_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          location: string | null
          meeting_url: string | null
          mode: Database["public"]["Enums"]["interview_mode"]
          proposed_at: string | null
          round: number
          rsvp: Database["public"]["Enums"]["rsvp_status"]
          rsvp_note: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["interview_status"]
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          meeting_url?: string | null
          mode?: Database["public"]["Enums"]["interview_mode"]
          proposed_at?: string | null
          round?: number
          rsvp?: Database["public"]["Enums"]["rsvp_status"]
          rsvp_note?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          meeting_url?: string | null
          mode?: Database["public"]["Enums"]["interview_mode"]
          proposed_at?: string | null
          round?: number
          rsvp?: Database["public"]["Enums"]["rsvp_status"]
          rsvp_note?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_alerts: {
        Row: {
          city: string | null
          created_at: string
          frequency: Database["public"]["Enums"]["alert_frequency"]
          id: string
          industry_id: number | null
          is_active: boolean
          keywords: string | null
          last_sent_at: string | null
          min_stipend: number | null
          name: string
          student_id: string
          updated_at: string
          work_type: Database["public"]["Enums"]["work_type"] | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["alert_frequency"]
          id?: string
          industry_id?: number | null
          is_active?: boolean
          keywords?: string | null
          last_sent_at?: string | null
          min_stipend?: number | null
          name?: string
          student_id?: string
          updated_at?: string
          work_type?: Database["public"]["Enums"]["work_type"] | null
        }
        Update: {
          city?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["alert_frequency"]
          id?: string
          industry_id?: number | null
          is_active?: boolean
          keywords?: string | null
          last_sent_at?: string | null
          min_stipend?: number | null
          name?: string
          student_id?: string
          updated_at?: string
          work_type?: Database["public"]["Enums"]["work_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "job_alerts_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_skills: {
        Row: {
          is_required: boolean
          job_id: string
          skill_id: number
        }
        Insert: {
          is_required?: boolean
          job_id: string
          skill_id: number
        }
        Update: {
          is_required?: boolean
          job_id?: string
          skill_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_skills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      job_views: {
        Row: {
          id: number
          job_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: never
          job_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: never
          job_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_views_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string | null
          application_count: number
          benefits: string
          city: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deadline: string | null
          department: string | null
          description: string
          duration_months: number | null
          id: string
          industry_id: number | null
          openings: number
          perks: string[]
          published_at: string | null
          rejection_reason: string | null
          requirements: string
          schedule: Database["public"]["Enums"]["work_schedule"]
          search: unknown
          status: Database["public"]["Enums"]["job_status"]
          stipend_currency: string
          stipend_max: number | null
          stipend_min: number | null
          stipend_negotiable: boolean
          submitted_at: string | null
          target_majors: string[]
          target_study_years: number[]
          title: string
          university_approval:
            | Database["public"]["Enums"]["approval_status"]
            | null
          university_id: string | null
          university_note: string | null
          updated_at: string
          view_count: number
          work_type: Database["public"]["Enums"]["work_type"]
        }
        Insert: {
          address?: string | null
          application_count?: number
          benefits?: string
          city?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          department?: string | null
          description?: string
          duration_months?: number | null
          id?: string
          industry_id?: number | null
          openings?: number
          perks?: string[]
          published_at?: string | null
          rejection_reason?: string | null
          requirements?: string
          schedule?: Database["public"]["Enums"]["work_schedule"]
          search?: unknown
          status?: Database["public"]["Enums"]["job_status"]
          stipend_currency?: string
          stipend_max?: number | null
          stipend_min?: number | null
          stipend_negotiable?: boolean
          submitted_at?: string | null
          target_majors?: string[]
          target_study_years?: number[]
          title: string
          university_approval?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          university_id?: string | null
          university_note?: string | null
          updated_at?: string
          view_count?: number
          work_type?: Database["public"]["Enums"]["work_type"]
        }
        Update: {
          address?: string | null
          application_count?: number
          benefits?: string
          city?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          department?: string | null
          description?: string
          duration_months?: number | null
          id?: string
          industry_id?: number | null
          openings?: number
          perks?: string[]
          published_at?: string | null
          rejection_reason?: string | null
          requirements?: string
          schedule?: Database["public"]["Enums"]["work_schedule"]
          search?: unknown
          status?: Database["public"]["Enums"]["job_status"]
          stipend_currency?: string
          stipend_max?: number | null
          stipend_min?: number | null
          stipend_negotiable?: boolean
          submitted_at?: string | null
          target_majors?: string[]
          target_study_years?: number[]
          title?: string
          university_approval?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          university_id?: string | null
          university_note?: string | null
          updated_at?: string
          view_count?: number
          work_type?: Database["public"]["Enums"]["work_type"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          metadata: Json
          sender_id: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          sender_id?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_application_updates: boolean
          email_community: boolean
          email_job_alerts: boolean
          email_marketing: boolean
          email_messages: boolean
          in_app: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_application_updates?: boolean
          email_community?: boolean
          email_job_alerts?: boolean
          email_marketing?: boolean
          email_messages?: boolean
          in_app?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_application_updates?: boolean
          email_community?: boolean
          email_job_alerts?: boolean
          email_marketing?: boolean
          email_messages?: boolean
          in_app?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          currency: string
          end_date: string | null
          expires_at: string
          id: string
          letter_path: string | null
          responded_at: string | null
          response_note: string | null
          sent_at: string
          start_date: string
          status: Database["public"]["Enums"]["offer_status"]
          stipend_amount: number | null
          terms: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          expires_at: string
          id?: string
          letter_path?: string | null
          responded_at?: string | null
          response_note?: string | null
          sent_at?: string
          start_date: string
          status?: Database["public"]["Enums"]["offer_status"]
          stipend_amount?: number | null
          terms?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          expires_at?: string
          id?: string
          letter_path?: string | null
          responded_at?: string | null
          response_note?: string | null
          sent_at?: string
          start_date?: string
          status?: Database["public"]["Enums"]["offer_status"]
          stipend_amount?: number | null
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_inquiries: {
        Row: {
          company_name: string | null
          contact_name: string
          created_at: string
          email: string
          id: string
          message: string | null
          phone: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
          university_id: string | null
        }
        Insert: {
          company_name?: string | null
          contact_name: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          university_id?: string | null
        }
        Update: {
          company_name?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          university_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_inquiries_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          id: string
          job_id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_bookmarks: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_anonymous: boolean
          parent_id: string | null
          post_id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          parent_id?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          parent_id?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comment_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          attachment_path: string | null
          author_id: string
          body: string
          comment_count: number
          company_id: string | null
          created_at: string
          id: string
          is_anonymous: boolean
          like_count: number
          rating: number | null
          status: Database["public"]["Enums"]["content_status"]
          tags: string[]
          title: string | null
          type: Database["public"]["Enums"]["post_type"]
          updated_at: string
        }
        Insert: {
          attachment_path?: string | null
          author_id?: string
          body: string
          comment_count?: number
          company_id?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          like_count?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string | null
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string
        }
        Update: {
          attachment_path?: string | null
          author_id?: string
          body?: string
          comment_count?: number
          company_id?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          like_count?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string | null
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_seen_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          last_seen_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_seen_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          action_taken: string | null
          created_at: string
          details: string | null
          handled_by: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          details?: string | null
          handled_by?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          details?: string | null
          handled_by?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          created_at: string
          job_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          job_id: string
          student_id?: string
        }
        Update: {
          created_at?: string
          job_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_question_keys: {
        Row: {
          ideal_answer: string
          question_id: string
        }
        Insert: {
          ideal_answer: string
          question_id: string
        }
        Update: {
          ideal_answer?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_question_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "screening_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_questions: {
        Row: {
          created_at: string
          id: string
          is_knockout: boolean
          is_required: boolean
          job_id: string
          kind: Database["public"]["Enums"]["question_kind"]
          options: Json
          position: number
          question: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_knockout?: boolean
          is_required?: boolean
          job_id: string
          kind?: Database["public"]["Enums"]["question_kind"]
          options?: Json
          position?: number
          question: string
        }
        Update: {
          created_at?: string
          id?: string
          is_knockout?: boolean
          is_required?: boolean
          job_id?: string
          kind?: Database["public"]["Enums"]["question_kind"]
          options?: Json
          position?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_questions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id?: number
          name: string
          slug: string
        }
        Update: {
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      student_profiles: {
        Row: {
          bio: string | null
          city: string | null
          created_at: string
          gpa: number | null
          graduation_year: number | null
          headline: string | null
          is_discoverable: boolean
          is_looking_for_job: boolean
          links: Json
          major: string | null
          student_code: string | null
          university_id: string | null
          updated_at: string
          user_id: string
          verification_note: string | null
          verification_status: Database["public"]["Enums"]["verify_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          bio?: string | null
          city?: string | null
          created_at?: string
          gpa?: number | null
          graduation_year?: number | null
          headline?: string | null
          is_discoverable?: boolean
          is_looking_for_job?: boolean
          links?: Json
          major?: string | null
          student_code?: string | null
          university_id?: string | null
          updated_at?: string
          user_id: string
          verification_note?: string | null
          verification_status?: Database["public"]["Enums"]["verify_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          bio?: string | null
          city?: string | null
          created_at?: string
          gpa?: number | null
          graduation_year?: number | null
          headline?: string | null
          is_discoverable?: boolean
          is_looking_for_job?: boolean
          links?: Json
          major?: string | null
          student_code?: string | null
          university_id?: string | null
          updated_at?: string
          user_id?: string
          verification_note?: string | null
          verification_status?: Database["public"]["Enums"]["verify_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_skills: {
        Row: {
          level: number | null
          skill_id: number
          student_id: string
        }
        Insert: {
          level?: number | null
          skill_id: number
          student_id?: string
        }
        Update: {
          level?: number | null
          skill_id?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_skills_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      universities: {
        Row: {
          city: string | null
          created_at: string
          email_domain: string | null
          id: string
          logo_path: string | null
          name: string
          short_name: string | null
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          logo_path?: string | null
          name: string
          short_name?: string | null
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          short_name?: string | null
          website?: string | null
        }
        Relationships: []
      }
      university_officers: {
        Row: {
          created_at: string
          department: string | null
          officer_code: string | null
          title: string | null
          university_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          officer_code?: string | null
          title?: string | null
          university_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          officer_code?: string | null
          title?: string | null
          university_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_officers_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_officers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_officers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      university_partnerships: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          document_path: string | null
          ends_on: string | null
          id: string
          note: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["partnership_status"]
          university_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          ends_on?: string | null
          id?: string
          note?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["partnership_status"]
          university_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          ends_on?: string | null
          id?: string
          note?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["partnership_status"]
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_partnerships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_partnerships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_partnerships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_partnerships_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      comment_feed: {
        Row: {
          author_avatar_path: string | null
          author_id: string | null
          author_name: string | null
          body: string | null
          created_at: string | null
          id: string | null
          is_anonymous: boolean | null
          parent_id: string | null
          post_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comment_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ratings: {
        Row: {
          avg_rating: number | null
          company_id: string | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      post_feed: {
        Row: {
          attachment_path: string | null
          author_avatar_path: string | null
          author_id: string | null
          author_name: string | null
          body: string | null
          comment_count: number | null
          company_id: string | null
          company_name: string | null
          created_at: string | null
          id: string | null
          is_anonymous: boolean | null
          like_count: number | null
          rating: number | null
          tags: string[] | null
          title: string | null
          type: Database["public"]["Enums"]["post_type"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          avatar_path: string | null
          full_name: string | null
          id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          avatar_path?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          avatar_path?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_company_member: {
        Args: {
          p_company: string
          p_email: string
          p_role?: Database["public"]["Enums"]["company_member_role"]
        }
        Returns: string
      }
      admin_close_job: {
        Args: { p_job: string; p_reason: string }
        Returns: undefined
      }
      admin_overview: { Args: never; Returns: Json }
      application_match_scores: {
        Args: { p_job: string }
        Returns: {
          application_id: string
          match_score: number
        }[]
      }
      apply_to_job: {
        Args: {
          p_answers?: Json
          p_cover_letter?: string
          p_cv?: string
          p_job: string
        }
        Returns: string
      }
      certify_internship_report: {
        Args: { p_approve: boolean; p_note?: string; p_report: string }
        Returns: string
      }
      change_job_status: {
        Args: {
          p_job: string
          p_status: Database["public"]["Enums"]["job_status"]
        }
        Returns: undefined
      }
      check_in_event: {
        Args: { p_event: string; p_ticket_code: string }
        Returns: undefined
      }
      company_interviews: {
        Args: { p_company?: string; p_from?: string; p_to?: string }
        Returns: {
          application_id: string
          candidate_avatar_path: string
          candidate_id: string
          candidate_name: string
          company_id: string
          duration_minutes: number
          interview_id: string
          job_id: string
          job_title: string
          location: string
          meeting_url: string
          mode: Database["public"]["Enums"]["interview_mode"]
          proposed_at: string
          round: number
          rsvp: Database["public"]["Enums"]["rsvp_status"]
          scheduled_at: string
          status: Database["public"]["Enums"]["interview_status"]
        }[]
      }
      create_company: {
        Args: {
          p_address?: string
          p_city?: string
          p_company_size?: string
          p_description?: string
          p_industry_id?: number
          p_name: string
          p_tax_code?: string
          p_website?: string
        }
        Returns: string
      }
      duplicate_job: { Args: { p_job: string }; Returns: string }
      ensure_skill: { Args: { p_name: string }; Returns: number }
      get_company_funnel: { Args: { p_company: string }; Returns: Json }
      get_moderation_kpis: { Args: { p_months?: number }; Returns: Json }
      get_platform_kpis: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      get_university_placement: {
        Args: { p_university?: string }
        Returns: Json
      }
      job_alert_matches: {
        Args: { p_alert: string }
        Returns: {
          address: string | null
          application_count: number
          benefits: string
          city: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deadline: string | null
          department: string | null
          description: string
          duration_months: number | null
          id: string
          industry_id: number | null
          openings: number
          perks: string[]
          published_at: string | null
          rejection_reason: string | null
          requirements: string
          schedule: Database["public"]["Enums"]["work_schedule"]
          search: unknown
          status: Database["public"]["Enums"]["job_status"]
          stipend_currency: string
          stipend_max: number | null
          stipend_min: number | null
          stipend_negotiable: boolean
          submitted_at: string | null
          target_majors: string[]
          target_study_years: number[]
          title: string
          university_approval:
            | Database["public"]["Enums"]["approval_status"]
            | null
          university_id: string | null
          university_note: string | null
          updated_at: string
          view_count: number
          work_type: Database["public"]["Enums"]["work_type"]
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      job_match_score: { Args: { p_job: string }; Returns: number }
      mark_application_viewed: {
        Args: { p_application: string }
        Returns: undefined
      }
      moderate_job: {
        Args: { p_approve: boolean; p_job: string; p_reason?: string }
        Returns: undefined
      }
      move_application_stage: {
        Args: { p_application: string; p_stage: string }
        Returns: undefined
      }
      rate_intern: {
        Args: { p_application: string; p_comment?: string; p_rating: number }
        Returns: undefined
      }
      record_job_view: { Args: { p_job: string }; Returns: undefined }
      register_for_event: { Args: { p_event: string }; Returns: string }
      request_student_verification: { Args: never; Returns: undefined }
      resolve_report: {
        Args: {
          p_action?: string
          p_note?: string
          p_report: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: undefined
      }
      respond_interview: {
        Args: {
          p_interview: string
          p_note?: string
          p_proposed_at?: string
          p_rsvp: Database["public"]["Enums"]["rsvp_status"]
        }
        Returns: undefined
      }
      respond_offer: {
        Args: { p_accept: boolean; p_note?: string; p_offer: string }
        Returns: undefined
      }
      review_company_verification: {
        Args: {
          p_company: string
          p_decision: Database["public"]["Enums"]["verify_status"]
          p_note?: string
        }
        Returns: undefined
      }
      review_event_booth: {
        Args: { p_approve: boolean; p_booth: string; p_note?: string }
        Returns: undefined
      }
      review_exclusive_job: {
        Args: { p_approve: boolean; p_job: string; p_note?: string }
        Returns: undefined
      }
      schedule_interview: {
        Args: {
          p_application: string
          p_duration_minutes?: number
          p_location?: string
          p_meeting_url?: string
          p_mode?: Database["public"]["Enums"]["interview_mode"]
          p_scheduled_at: string
        }
        Returns: string
      }
      search_candidates: {
        Args: {
          p_city?: string
          p_graduation_year?: number
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_skill_ids?: number[]
          p_university_id?: string
        }
        Returns: {
          avatar_path: string
          city: string
          full_name: string
          graduation_year: number
          headline: string
          is_verified: boolean
          major: string
          skill_matches: number
          skills: string[]
          total_count: number
          university_id: string
          university_name: string
          user_id: string
        }[]
      }
      search_jobs: {
        Args: {
          p_city?: string
          p_company_id?: string
          p_exclude_job?: string
          p_final_year?: boolean
          p_industry_id?: number
          p_limit?: number
          p_min_stipend?: number
          p_offset?: number
          p_query?: string
          p_schedules?: Database["public"]["Enums"]["work_schedule"][]
          p_sort?: string
          p_university_codes?: string[]
          p_urgent?: boolean
          p_work_type?: Database["public"]["Enums"]["work_type"]
          p_work_types?: Database["public"]["Enums"]["work_type"][]
        }
        Returns: {
          application_count: number
          city: string
          company_id: string
          company_logo_path: string
          company_name: string
          company_verified: boolean
          deadline: string
          excerpt: string
          id: string
          industry_id: number
          is_exclusive: boolean
          match_score: number
          perks: string[]
          published_at: string
          rank: number
          schedule: Database["public"]["Enums"]["work_schedule"]
          skills: string[]
          stipend_max: number
          stipend_min: number
          stipend_negotiable: boolean
          title: string
          total_count: number
          view_count: number
          work_type: Database["public"]["Enums"]["work_type"]
        }[]
      }
      send_offer: {
        Args: {
          p_application: string
          p_end_date?: string
          p_expires_at: string
          p_letter_path?: string
          p_start_date: string
          p_stipend_amount?: number
          p_terms?: string
        }
        Returns: string
      }
      set_user_status: {
        Args: {
          p_reason?: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_user: string
        }
        Returns: undefined
      }
      start_conversation: {
        Args: { p_company?: string; p_with_user: string }
        Returns: string
      }
      submit_company_verification: {
        Args: { p_company: string }
        Returns: undefined
      }
      submit_internship_report: {
        Args: { p_application: string; p_summary: string }
        Returns: string
      }
      submit_job: { Args: { p_job: string }; Returns: undefined }
      update_application_status: {
        Args: {
          p_application: string
          p_note?: string
          p_status: Database["public"]["Enums"]["application_status"]
        }
        Returns: undefined
      }
      update_interview: {
        Args: {
          p_interview: string
          p_location?: string
          p_meeting_url?: string
          p_scheduled_at?: string
          p_status?: Database["public"]["Enums"]["interview_status"]
        }
        Returns: undefined
      }
      verify_internship_certificate: { Args: { p_code: string }; Returns: Json }
      verify_student: {
        Args: { p_approve: boolean; p_note?: string; p_student: string }
        Returns: undefined
      }
      withdraw_application: {
        Args: { p_application: string; p_reason?: string }
        Returns: undefined
      }
      withdraw_offer: {
        Args: { p_offer: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status:
        | "active"
        | "pending_verification"
        | "suspended"
        | "deactivated"
      alert_frequency: "instant" | "daily" | "weekly"
      application_status:
        | "applied"
        | "cv_viewed"
        | "shortlisted"
        | "interviewing"
        | "offered"
        | "hired"
        | "rejected"
        | "withdrawn"
        | "offer_declined"
      approval_status: "pending" | "approved" | "rejected"
      cert_status: "draft" | "submitted" | "certified" | "rejected"
      company_member_role: "owner" | "admin" | "recruiter"
      content_status: "published" | "hidden" | "removed"
      cv_source: "builder" | "upload"
      event_status: "draft" | "published" | "cancelled" | "completed"
      inquiry_status: "new" | "contacted" | "closed"
      interview_mode: "online" | "onsite" | "phone"
      interview_status: "scheduled" | "completed" | "cancelled" | "no_show"
      job_status:
        | "draft"
        | "pending_approval"
        | "active"
        | "rejected"
        | "paused"
        | "closed"
        | "expired"
      message_kind: "text" | "file" | "interview_invite" | "system"
      notification_type:
        | "application_received"
        | "application_status"
        | "cv_viewed"
        | "interview_invite"
        | "interview_rsvp"
        | "offer_received"
        | "offer_response"
        | "job_moderated"
        | "company_verification"
        | "student_verification"
        | "message"
        | "report_update"
        | "job_alert"
        | "event"
        | "account"
        | "system"
      offer_status: "sent" | "accepted" | "declined" | "expired" | "withdrawn"
      partnership_status: "pending" | "active" | "expired" | "terminated"
      post_type: "experience" | "question" | "review" | "document"
      question_kind: "yes_no" | "short_text" | "single_choice"
      report_reason:
        | "scam_fee"
        | "fake_job"
        | "harassment"
        | "spam"
        | "misinformation"
        | "inappropriate"
        | "other"
      report_status: "open" | "in_review" | "resolved" | "dismissed"
      report_target: "job" | "company" | "user" | "post" | "comment" | "message"
      rsvp_status: "pending" | "accepted" | "reschedule_requested" | "declined"
      user_role: "student" | "employer" | "university_officer" | "admin"
      verify_status:
        | "unverified"
        | "pending"
        | "verified"
        | "rejected"
        | "revoked"
      work_schedule: "full_time" | "part_time" | "flexible"
      work_type: "onsite" | "hybrid" | "remote"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: [
        "active",
        "pending_verification",
        "suspended",
        "deactivated",
      ],
      alert_frequency: ["instant", "daily", "weekly"],
      application_status: [
        "applied",
        "cv_viewed",
        "shortlisted",
        "interviewing",
        "offered",
        "hired",
        "rejected",
        "withdrawn",
        "offer_declined",
      ],
      approval_status: ["pending", "approved", "rejected"],
      cert_status: ["draft", "submitted", "certified", "rejected"],
      company_member_role: ["owner", "admin", "recruiter"],
      content_status: ["published", "hidden", "removed"],
      cv_source: ["builder", "upload"],
      event_status: ["draft", "published", "cancelled", "completed"],
      inquiry_status: ["new", "contacted", "closed"],
      interview_mode: ["online", "onsite", "phone"],
      interview_status: ["scheduled", "completed", "cancelled", "no_show"],
      job_status: [
        "draft",
        "pending_approval",
        "active",
        "rejected",
        "paused",
        "closed",
        "expired",
      ],
      message_kind: ["text", "file", "interview_invite", "system"],
      notification_type: [
        "application_received",
        "application_status",
        "cv_viewed",
        "interview_invite",
        "interview_rsvp",
        "offer_received",
        "offer_response",
        "job_moderated",
        "company_verification",
        "student_verification",
        "message",
        "report_update",
        "job_alert",
        "event",
        "account",
        "system",
      ],
      offer_status: ["sent", "accepted", "declined", "expired", "withdrawn"],
      partnership_status: ["pending", "active", "expired", "terminated"],
      post_type: ["experience", "question", "review", "document"],
      question_kind: ["yes_no", "short_text", "single_choice"],
      report_reason: [
        "scam_fee",
        "fake_job",
        "harassment",
        "spam",
        "misinformation",
        "inappropriate",
        "other",
      ],
      report_status: ["open", "in_review", "resolved", "dismissed"],
      report_target: ["job", "company", "user", "post", "comment", "message"],
      rsvp_status: ["pending", "accepted", "reschedule_requested", "declined"],
      user_role: ["student", "employer", "university_officer", "admin"],
      verify_status: [
        "unverified",
        "pending",
        "verified",
        "rejected",
        "revoked",
      ],
      work_schedule: ["full_time", "part_time", "flexible"],
      work_type: ["onsite", "hybrid", "remote"],
    },
  },
} as const
