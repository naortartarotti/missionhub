export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempts: number
          created_at: string
          dedup_key: string
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: Database["public"]["Enums"]["background_job_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedup_key: string
          finished_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
          status?: Database["public"]["Enums"]["background_job_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          dedup_key?: string
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
          status?: Database["public"]["Enums"]["background_job_status"]
        }
        Relationships: []
      }
      candidate_consents: {
        Row: {
          candidate_id: string
          created_at: string
          evidence: string
          expires_at: string | null
          id: string
          job_id: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          legal_basis: Database["public"]["Enums"]["legal_basis"]
          obtained_at: string
          organization_id: string
          recorded_by: string
          revoked_at: string | null
          revoked_reason: string | null
          scope: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          evidence: string
          expires_at?: string | null
          id?: string
          job_id?: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          legal_basis?: Database["public"]["Enums"]["legal_basis"]
          obtained_at?: string
          organization_id: string
          recorded_by: string
          revoked_at?: string | null
          revoked_reason?: string | null
          scope: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          evidence?: string
          expires_at?: string | null
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["consent_kind"]
          legal_basis?: Database["public"]["Enums"]["legal_basis"]
          obtained_at?: string
          organization_id?: string
          recorded_by?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_consents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_consents_job_fk"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_documents: {
        Row: {
          candidate_id: string
          created_at: string
          deleted_at: string | null
          extracted_text: string | null
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          scan_status: Database["public"]["Enums"]["document_scan_status"]
          sha256: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          deleted_at?: string | null
          extracted_text?: string | null
          file_name: string
          id?: string
          mime_type: string
          organization_id: string
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          sha256: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          deleted_at?: string | null
          extracted_text?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          sha256?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_documents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_experiences: {
        Row: {
          candidate_id: string
          company: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          organization_id: string
          start_date: string | null
          title: string
        }
        Insert: {
          candidate_id: string
          company?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          organization_id: string
          start_date?: string | null
          title: string
        }
        Update: {
          candidate_id?: string
          company?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          organization_id?: string
          start_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_experiences_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_experiences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          anonymized_at: string | null
          available_from: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          headline: string | null
          id: string
          languages: string[]
          last_reviewed_at: string | null
          legal_basis: Database["public"]["Enums"]["legal_basis"]
          location_city: string | null
          location_country: string | null
          location_region: string | null
          notes: string | null
          open_to_relocation: boolean
          organization_id: string
          owner_id: string
          phone: string | null
          privacy_notice_given_at: string | null
          processing_purpose: string
          retention_until: string | null
          salary_currency: string | null
          salary_expectation_max: number | null
          salary_expectation_min: number | null
          seniority: Database["public"]["Enums"]["seniority_level"] | null
          skills: string[]
          source: string
          source_detail: string | null
          status: Database["public"]["Enums"]["candidate_status"]
          summary: string | null
          tags: string[]
          updated_at: string
          work_arrangements: Database["public"]["Enums"]["work_arrangement"][]
          years_experience: number | null
        }
        Insert: {
          anonymized_at?: string | null
          available_from?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          headline?: string | null
          id?: string
          languages?: string[]
          last_reviewed_at?: string | null
          legal_basis?: Database["public"]["Enums"]["legal_basis"]
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          notes?: string | null
          open_to_relocation?: boolean
          organization_id: string
          owner_id: string
          phone?: string | null
          privacy_notice_given_at?: string | null
          processing_purpose?: string
          retention_until?: string | null
          salary_currency?: string | null
          salary_expectation_max?: number | null
          salary_expectation_min?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          skills?: string[]
          source?: string
          source_detail?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          summary?: string | null
          tags?: string[]
          updated_at?: string
          work_arrangements?: Database["public"]["Enums"]["work_arrangement"][]
          years_experience?: number | null
        }
        Update: {
          anonymized_at?: string | null
          available_from?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          headline?: string | null
          id?: string
          languages?: string[]
          last_reviewed_at?: string | null
          legal_basis?: Database["public"]["Enums"]["legal_basis"]
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          notes?: string | null
          open_to_relocation?: boolean
          organization_id?: string
          owner_id?: string
          phone?: string | null
          privacy_notice_given_at?: string | null
          processing_purpose?: string
          retention_until?: string | null
          salary_currency?: string | null
          salary_expectation_max?: number | null
          salary_expectation_min?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          skills?: string[]
          source?: string
          source_detail?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          summary?: string | null
          tags?: string[]
          updated_at?: string
          work_arrangements?: Database["public"]["Enums"]["work_arrangement"][]
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_owner_profile_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_agreements: {
        Row: {
          created_at: string
          id: string
          job_owner_bps: number
          platform_bps: number
          referral_id: string
          rule_id: string
          rule_name: string
          rule_version: number
          source_accepted_at: string | null
          source_accepted_by: string | null
          sourcing_bps: number
          status: Database["public"]["Enums"]["agreement_status"]
          target_accepted_at: string | null
          target_accepted_by: string | null
          terms_version: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_owner_bps: number
          platform_bps: number
          referral_id: string
          rule_id: string
          rule_name: string
          rule_version: number
          source_accepted_at?: string | null
          source_accepted_by?: string | null
          sourcing_bps: number
          status?: Database["public"]["Enums"]["agreement_status"]
          target_accepted_at?: string | null
          target_accepted_by?: string | null
          terms_version?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_owner_bps?: number
          platform_bps?: number
          referral_id?: string
          rule_id?: string
          rule_name?: string
          rule_version?: number
          source_accepted_at?: string | null
          source_accepted_by?: string | null
          sourcing_bps?: number
          status?: Database["public"]["Enums"]["agreement_status"]
          target_accepted_at?: string | null
          target_accepted_by?: string | null
          terms_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_agreements_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_agreements_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_ledger_entries: {
        Row: {
          amount_minor: number
          created_at: string
          created_by: string | null
          currency: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: number
          idempotency_key: string
          memo: string | null
          organization_id: string | null
          party: Database["public"]["Enums"]["ledger_party"]
          payment_evidence_id: string | null
          placement_id: string
          reverses_entry_id: number | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          created_by?: string | null
          currency: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          idempotency_key: string
          memo?: string | null
          organization_id?: string | null
          party: Database["public"]["Enums"]["ledger_party"]
          payment_evidence_id?: string | null
          placement_id: string
          reverses_entry_id?: number | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          idempotency_key?: string
          memo?: string | null
          organization_id?: string | null
          party?: Database["public"]["Enums"]["ledger_party"]
          payment_evidence_id?: string | null
          placement_id?: string
          reverses_entry_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_entries_payment_evidence_id_fkey"
            columns: ["payment_evidence_id"]
            isOneToOne: false
            referencedRelation: "payment_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_entries_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "commission_ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          is_default: boolean
          job_owner_bps: number
          name: string
          platform_bps: number
          retired_at: string | null
          sourcing_bps: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_default?: boolean
          job_owner_bps: number
          name: string
          platform_bps: number
          retired_at?: string | null
          sourcing_bps: number
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_default?: boolean
          job_owner_bps?: number
          name?: string
          platform_bps?: number
          retired_at?: string | null
          sourcing_bps?: number
          version?: number
        }
        Relationships: []
      }
      disputes: {
        Row: {
          created_at: string
          id: string
          opened_by: string
          opened_by_org: string
          placement_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          opened_by: string
          opened_by_org: string
          placement_id: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          opened_by?: string
          opened_by_org?: string
          placement_id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_org_fkey"
            columns: ["opened_by_org"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_records: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          due_on: string | null
          id: string
          invoice_number: string
          issued_on: string
          placement_id: string
          recorded_by: string
          tax_minor: number
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          due_on?: string | null
          id?: string
          invoice_number: string
          issued_on: string
          placement_id: string
          recorded_by: string
          tax_minor?: number
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          invoice_number?: string
          issued_on?: string
          placement_id?: string
          recorded_by?: string
          tax_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_records_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          accepts_external_referrals: boolean
          client_confidential: boolean
          client_name: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string | null
          description: string
          expected_fee_minor: number | null
          fee_currency: string
          id: string
          languages: string[]
          location_city: string | null
          location_country: string | null
          location_region: string | null
          min_years_experience: number | null
          organization_id: string
          owner_id: string
          preferred_skills: string[]
          required_skills: string[]
          salary_currency: string
          salary_max: number | null
          salary_min: number | null
          seniority: Database["public"]["Enums"]["seniority_level"] | null
          share_description: boolean
          share_fee: boolean
          share_location: boolean
          share_salary: boolean
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          work_arrangement: Database["public"]["Enums"]["work_arrangement"]
        }
        Insert: {
          accepts_external_referrals?: boolean
          client_confidential?: boolean
          client_name?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          description?: string
          expected_fee_minor?: number | null
          fee_currency?: string
          id?: string
          languages?: string[]
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          min_years_experience?: number | null
          organization_id: string
          owner_id: string
          preferred_skills?: string[]
          required_skills?: string[]
          salary_currency?: string
          salary_max?: number | null
          salary_min?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          share_description?: boolean
          share_fee?: boolean
          share_location?: boolean
          share_salary?: boolean
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          work_arrangement?: Database["public"]["Enums"]["work_arrangement"]
        }
        Update: {
          accepts_external_referrals?: boolean
          client_confidential?: boolean
          client_name?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          description?: string
          expected_fee_minor?: number | null
          fee_currency?: string
          id?: string
          languages?: string[]
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          min_years_experience?: number | null
          organization_id?: string
          owner_id?: string
          preferred_skills?: string[]
          required_skills?: string[]
          salary_currency?: string
          salary_max?: number | null
          salary_min?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          share_description?: boolean
          share_fee?: boolean
          share_location?: boolean
          share_salary?: boolean
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          work_arrangement?: Database["public"]["Enums"]["work_arrangement"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_owner_profile_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_feedback: {
        Row: {
          comment: string | null
          created_at: string
          helpful: boolean
          id: string
          match_id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          helpful: boolean
          id?: string
          match_id: string
          organization_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          helpful?: boolean
          id?: string
          match_id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_feedback_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          band: Database["public"]["Enums"]["match_band"]
          blockers: Json
          candidate_id: string
          candidate_org_id: string
          created_at: string
          expired_at: string | null
          factor_scores: Json
          gaps: Json
          id: string
          input_hash: string
          job_id: string
          job_org_id: string
          model_version: string
          reasons: Json
          refreshed_at: string
          score: number
        }
        Insert: {
          band: Database["public"]["Enums"]["match_band"]
          blockers?: Json
          candidate_id: string
          candidate_org_id: string
          created_at?: string
          expired_at?: string | null
          factor_scores?: Json
          gaps?: Json
          id?: string
          input_hash: string
          job_id: string
          job_org_id: string
          model_version: string
          reasons?: Json
          refreshed_at?: string
          score: number
        }
        Update: {
          band?: Database["public"]["Enums"]["match_band"]
          blockers?: Json
          candidate_id?: string
          candidate_org_id?: string
          created_at?: string
          expired_at?: string | null
          factor_scores?: Json
          gaps?: Json
          id?: string
          input_hash?: string
          job_id?: string
          job_org_id?: string
          model_version?: string
          reasons?: Json
          refreshed_at?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "matches_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_candidate_org_id_fkey"
            columns: ["candidate_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_job_org_id_fkey"
            columns: ["job_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email: boolean
          in_app: boolean
          kind: string
          user_id: string
        }
        Insert: {
          email?: boolean
          in_app?: boolean
          kind: string
          user_id: string
        }
        Update: {
          email?: boolean
          in_app?: boolean
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          email_status: string
          id: string
          kind: string
          link: string | null
          organization_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          email_status?: string
          id?: string
          kind: string
          link?: string | null
          organization_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          email_status?: string
          id?: string
          kind?: string
          link?: string | null
          organization_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_user_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country: string
          created_at: string
          created_by: string | null
          default_currency: string
          id: string
          is_demo: boolean
          kind: Database["public"]["Enums"]["organization_kind"]
          locale: string
          name: string
          slug: string
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          id?: string
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["organization_kind"]
          locale?: string
          name: string
          slug: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          id?: string
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["organization_kind"]
          locale?: string
          name?: string
          slug?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_evidence: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          notes: string | null
          occurred_on: string
          placement_id: string
          processing_fee_minor: number
          recorded_by: string
          recorded_by_org: string | null
          reference: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["evidence_status"]
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          notes?: string | null
          occurred_on: string
          placement_id: string
          processing_fee_minor?: number
          recorded_by: string
          recorded_by_org?: string | null
          reference: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["evidence_status"]
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["evidence_kind"]
          notes?: string | null
          occurred_on?: string
          placement_id?: string
          processing_fee_minor?: number
          recorded_by?: string
          recorded_by_org?: string | null
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["evidence_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_evidence_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_evidence_recorded_by_org_fkey"
            columns: ["recorded_by_org"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_status_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["placement_status"] | null
          id: number
          placement_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["placement_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["placement_status"] | null
          id?: never
          placement_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["placement_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["placement_status"] | null
          id?: never
          placement_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["placement_status"]
        }
        Relationships: [
          {
            foreignKeyName: "placement_status_events_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
        ]
      }
      placements: {
        Row: {
          agreement_id: string
          contracted_fee_minor: number
          created_at: string
          currency: string
          guarantee_until: string | null
          id: string
          referral_id: string
          reported_by: string
          settled_at: string | null
          source_org_id: string
          start_date: string
          status: Database["public"]["Enums"]["placement_status"]
          status_before_dispute:
            | Database["public"]["Enums"]["placement_status"]
            | null
          target_org_id: string
          updated_at: string
          version: number
        }
        Insert: {
          agreement_id: string
          contracted_fee_minor: number
          created_at?: string
          currency: string
          guarantee_until?: string | null
          id?: string
          referral_id: string
          reported_by: string
          settled_at?: string | null
          source_org_id: string
          start_date: string
          status?: Database["public"]["Enums"]["placement_status"]
          status_before_dispute?:
            | Database["public"]["Enums"]["placement_status"]
            | null
          target_org_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          agreement_id?: string
          contracted_fee_minor?: number
          created_at?: string
          currency?: string
          guarantee_until?: string | null
          id?: string
          referral_id?: string
          reported_by?: string
          settled_at?: string | null
          source_org_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["placement_status"]
          status_before_dispute?:
            | Database["public"]["Enums"]["placement_status"]
            | null
          target_org_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "placements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "collaboration_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_source_org_id_fkey"
            columns: ["source_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_requests: {
        Row: {
          candidate_id: string | null
          created_at: string
          created_by: string | null
          details: string | null
          due_at: string
          handled_by: string | null
          id: string
          kind: string
          organization_id: string
          requester_contact: string
          resolution: string | null
          status: string
          updated_at: string
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          due_at?: string
          handled_by?: string | null
          id?: string
          kind: string
          organization_id: string
          requester_contact: string
          resolution?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          due_at?: string
          handled_by?: string | null
          id?: string
          kind?: string
          organization_id?: string
          requester_contact?: string
          resolution?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_requests_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          headline: string | null
          id: string
          is_platform_admin: boolean
          onboarded_at: string | null
          regions: string[]
          specialties: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          headline?: string | null
          id: string
          is_platform_admin?: boolean
          onboarded_at?: string | null
          regions?: string[]
          specialties?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          headline?: string | null
          id?: string
          is_platform_admin?: boolean
          onboarded_at?: string | null
          regions?: string[]
          specialties?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      referral_candidate_links: {
        Row: {
          candidate_id: string
          consent_id: string
          created_at: string
          organization_id: string
          referral_id: string
        }
        Insert: {
          candidate_id: string
          consent_id: string
          created_at?: string
          organization_id: string
          referral_id: string
        }
        Update: {
          candidate_id?: string
          consent_id?: string
          created_at?: string
          organization_id?: string
          referral_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_candidate_links_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_candidate_links_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "candidate_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_candidate_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_candidate_links_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_document_grants: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          referral_id: string
          revoked_at: string | null
          size_bytes: number
          status: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          referral_id: string
          revoked_at?: string | null
          size_bytes: number
          status?: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          referral_id?: string
          revoked_at?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_document_grants_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_document_sources: {
        Row: {
          candidate_document_id: string
          grant_id: string
          organization_id: string
        }
        Insert: {
          candidate_document_id: string
          grant_id: string
          organization_id: string
        }
        Update: {
          candidate_document_id?: string
          grant_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_document_sources_candidate_document_id_fkey"
            columns: ["candidate_document_id"]
            isOneToOne: false
            referencedRelation: "candidate_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_document_sources_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "referral_document_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_document_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_messages: {
        Row: {
          author_id: string
          author_side: Database["public"]["Enums"]["referral_side"]
          body: string
          created_at: string
          id: string
          referral_id: string
        }
        Insert: {
          author_id: string
          author_side: Database["public"]["Enums"]["referral_side"]
          body: string
          created_at?: string
          id?: string
          referral_id: string
        }
        Update: {
          author_id?: string
          author_side?: Database["public"]["Enums"]["referral_side"]
          body?: string
          created_at?: string
          id?: string
          referral_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_messages_author_profile_fk"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_messages_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_shared_profiles: {
        Row: {
          created_at: string
          disclosed_fields: string[]
          referral_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          disclosed_fields: string[]
          referral_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          disclosed_fields?: string[]
          referral_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "referral_shared_profiles_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_status_events: {
        Row: {
          actor_id: string | null
          actor_side: Database["public"]["Enums"]["referral_side"] | null
          created_at: string
          from_status: Database["public"]["Enums"]["referral_status"] | null
          id: number
          reason: string | null
          referral_id: string
          to_status: Database["public"]["Enums"]["referral_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_side?: Database["public"]["Enums"]["referral_side"] | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["referral_status"] | null
          id?: never
          reason?: string | null
          referral_id: string
          to_status: Database["public"]["Enums"]["referral_status"]
        }
        Update: {
          actor_id?: string | null
          actor_side?: Database["public"]["Enums"]["referral_side"] | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["referral_status"] | null
          id?: never
          reason?: string | null
          referral_id?: string
          to_status?: Database["public"]["Enums"]["referral_status"]
        }
        Relationships: [
          {
            foreignKeyName: "referral_status_events_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_transitions: {
        Row: {
          actor_side: Database["public"]["Enums"]["referral_side"]
          from_status: Database["public"]["Enums"]["referral_status"]
          requires_active_agreement: boolean
          requires_reason: boolean
          to_status: Database["public"]["Enums"]["referral_status"]
        }
        Insert: {
          actor_side: Database["public"]["Enums"]["referral_side"]
          from_status: Database["public"]["Enums"]["referral_status"]
          requires_active_agreement?: boolean
          requires_reason?: boolean
          to_status: Database["public"]["Enums"]["referral_status"]
        }
        Update: {
          actor_side?: Database["public"]["Enums"]["referral_side"]
          from_status?: Database["public"]["Enums"]["referral_status"]
          requires_active_agreement?: boolean
          requires_reason?: boolean
          to_status?: Database["public"]["Enums"]["referral_status"]
        }
        Relationships: []
      }
      referrals: {
        Row: {
          candidate_label: string
          created_at: string
          decided_at: string | null
          id: string
          idempotency_key: string
          job_id: string
          job_title_snapshot: string
          ownership_protected_until: string
          sharing_revoked_at: string | null
          source_org_id: string
          source_user_id: string
          status: Database["public"]["Enums"]["referral_status"]
          submitted_at: string
          target_org_id: string
          updated_at: string
          version: number
        }
        Insert: {
          candidate_label: string
          created_at?: string
          decided_at?: string | null
          id?: string
          idempotency_key: string
          job_id: string
          job_title_snapshot: string
          ownership_protected_until?: string
          sharing_revoked_at?: string | null
          source_org_id: string
          source_user_id: string
          status?: Database["public"]["Enums"]["referral_status"]
          submitted_at?: string
          target_org_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          candidate_label?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          idempotency_key?: string
          job_id?: string
          job_title_snapshot?: string
          ownership_protected_until?: string
          sharing_revoked_at?: string | null
          source_org_id?: string
          source_user_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
          submitted_at?: string
          target_org_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "referrals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_source_org_id_fkey"
            columns: ["source_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      anonymize_candidate: {
        Args: { p_candidate: string; p_reason: string }
        Returns: undefined
      }
      audit_document_access: {
        Args: { p_document: string }
        Returns: undefined
      }
      authorize_referral_document: {
        Args: { p_grant: string }
        Returns: string
      }
      claim_background_jobs: {
        Args: { p_limit?: number; p_worker: string }
        Returns: {
          attempts: number
          created_at: string
          dedup_key: string
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: Database["public"]["Enums"]["background_job_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "background_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_background_job: { Args: { p_id: string }; Returns: undefined }
      confirm_agreement: { Args: { p_referral: string }; Returns: undefined }
      create_invitation: {
        Args: {
          p_email: string
          p_org: string
          p_role: Database["public"]["Enums"]["membership_role"]
        }
        Returns: string
      }
      create_organization: {
        Args: {
          p_kind?: Database["public"]["Enums"]["organization_kind"]
          p_name: string
          p_slug: string
        }
        Returns: string
      }
      fail_background_job: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      get_job_match_summary: {
        Args: { p_job: string }
        Returns: {
          last_refreshed_at: string
          potential_count: number
          strong_count: number
        }[]
      }
      get_opportunities: {
        Args: { p_candidate?: string; p_match?: string; p_org: string }
        Returns: {
          band: Database["public"]["Enums"]["match_band"]
          blockers: Json
          candidate_headline: string
          candidate_id: string
          candidate_name: string
          client_label: string
          contract_type: Database["public"]["Enums"]["contract_type"]
          description: string
          expected_fee_minor: number
          fee_currency: string
          gaps: Json
          job_id: string
          job_org_name: string
          job_title: string
          location: string
          match_id: string
          model_version: string
          preferred_skills: string[]
          reasons: Json
          referral_id: string
          referral_status: string
          refreshed_at: string
          required_skills: string[]
          salary_currency: string
          salary_max: number
          salary_min: number
          score: number
          seniority: Database["public"]["Enums"]["seniority_level"]
          work_arrangement: Database["public"]["Enums"]["work_arrangement"]
        }[]
      }
      mark_grant_copied: {
        Args: { p_grant: string; p_ok: boolean; p_path: string }
        Returns: undefined
      }
      open_dispute: {
        Args: { p_placement: string; p_reason: string }
        Returns: string
      }
      publish_commission_rule: {
        Args: {
          p_job_owner: number
          p_name: string
          p_platform: number
          p_sourcing: number
        }
        Returns: string
      }
      record_invoice: {
        Args: {
          p_amount_minor: number
          p_due_on: string
          p_issued_on: string
          p_number: string
          p_placement: string
          p_tax_minor: number
        }
        Returns: string
      }
      record_payment_evidence: {
        Args: {
          p_amount_minor: number
          p_idempotency_key: string
          p_kind: Database["public"]["Enums"]["evidence_kind"]
          p_notes: string
          p_occurred_on: string
          p_placement: string
          p_processing_fee_minor: number
          p_reference: string
        }
        Returns: string
      }
      report_hire: {
        Args: {
          p_currency: string
          p_expected_version: number
          p_fee_minor: number
          p_guarantee_days?: number
          p_referral: string
          p_start_date: string
        }
        Returns: string
      }
      resolve_dispute: {
        Args: { p_dispute: string; p_resolution: string; p_upheld: boolean }
        Returns: undefined
      }
      review_payment_evidence: {
        Args: { p_approve: boolean; p_evidence: string; p_note: string }
        Returns: undefined
      }
      submit_referral: {
        Args: {
          p_candidate: string
          p_consent: string
          p_document_ids: string[]
          p_fields: string[]
          p_idempotency_key: string
          p_job: string
          p_note?: string
        }
        Returns: string
      }
      transition_referral: {
        Args: {
          p_expected_version: number
          p_reason: string
          p_referral: string
          p_to: Database["public"]["Enums"]["referral_status"]
        }
        Returns: number
      }
    }
    Enums: {
      agreement_status: "pending_source" | "active" | "terminated"
      background_job_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "dead"
      candidate_status:
        | "draft"
        | "active_for_matching"
        | "unavailable"
        | "archived"
        | "deleted"
      consent_kind: "processing" | "job_sharing"
      contract_type: "permanent" | "contract" | "temporary" | "contract_to_hire"
      document_scan_status: "pending" | "clean" | "rejected"
      evidence_kind:
        | "client_payment"
        | "sourcing_payout"
        | "platform_remittance"
        | "client_refund"
      evidence_status: "pending" | "verified" | "rejected"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      job_status:
        | "draft"
        | "active"
        | "paused"
        | "closed"
        | "filled"
        | "cancelled"
      ledger_entry_type:
        | "fee_received"
        | "allocation"
        | "payout"
        | "remittance"
        | "refund"
        | "allocation_reversal"
        | "adjustment"
      ledger_party: "job_owner" | "sourcing" | "platform" | "client"
      legal_basis:
        | "consent"
        | "contract"
        | "legitimate_interest"
        | "other_documented"
      match_band: "strong" | "potential" | "not_eligible"
      membership_role: "org_admin" | "recruiter_manager" | "recruiter"
      membership_status: "active" | "suspended"
      organization_kind: "agency" | "independent"
      placement_status:
        | "hire_reported"
        | "invoiced"
        | "payment_partially_verified"
        | "commission_payable"
        | "settled"
        | "disputed"
        | "cancelled"
      referral_side: "source" | "target"
      referral_status:
        | "submitted"
        | "under_review"
        | "info_requested"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "interviewing"
        | "offer"
        | "hired"
        | "rejected"
        | "cancelled"
      seniority_level:
        | "intern"
        | "junior"
        | "mid"
        | "senior"
        | "lead"
        | "principal"
        | "executive"
      work_arrangement: "remote" | "hybrid" | "onsite"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      agreement_status: ["pending_source", "active", "terminated"],
      background_job_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "dead",
      ],
      candidate_status: [
        "draft",
        "active_for_matching",
        "unavailable",
        "archived",
        "deleted",
      ],
      consent_kind: ["processing", "job_sharing"],
      contract_type: ["permanent", "contract", "temporary", "contract_to_hire"],
      document_scan_status: ["pending", "clean", "rejected"],
      evidence_kind: [
        "client_payment",
        "sourcing_payout",
        "platform_remittance",
        "client_refund",
      ],
      evidence_status: ["pending", "verified", "rejected"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      job_status: [
        "draft",
        "active",
        "paused",
        "closed",
        "filled",
        "cancelled",
      ],
      ledger_entry_type: [
        "fee_received",
        "allocation",
        "payout",
        "remittance",
        "refund",
        "allocation_reversal",
        "adjustment",
      ],
      ledger_party: ["job_owner", "sourcing", "platform", "client"],
      legal_basis: [
        "consent",
        "contract",
        "legitimate_interest",
        "other_documented",
      ],
      match_band: ["strong", "potential", "not_eligible"],
      membership_role: ["org_admin", "recruiter_manager", "recruiter"],
      membership_status: ["active", "suspended"],
      organization_kind: ["agency", "independent"],
      placement_status: [
        "hire_reported",
        "invoiced",
        "payment_partially_verified",
        "commission_payable",
        "settled",
        "disputed",
        "cancelled",
      ],
      referral_side: ["source", "target"],
      referral_status: [
        "submitted",
        "under_review",
        "info_requested",
        "accepted",
        "declined",
        "withdrawn",
        "interviewing",
        "offer",
        "hired",
        "rejected",
        "cancelled",
      ],
      seniority_level: [
        "intern",
        "junior",
        "mid",
        "senior",
        "lead",
        "principal",
        "executive",
      ],
      work_arrangement: ["remote", "hybrid", "onsite"],
    },
  },
} as const

