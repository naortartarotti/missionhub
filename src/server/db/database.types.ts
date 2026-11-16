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
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at: string | null
          window_count: number
          window_started_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at?: string | null
          window_count?: number
          window_started_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          prefix?: string
          revoked_at?: string | null
          window_count?: number
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_creator_profile_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
            foreignKeyName: "audit_events_actor_profile_fk"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          disputed_at: string | null
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
          disputed_at?: string | null
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
          disputed_at?: string | null
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
          has_passport: boolean | null
          headline: string | null
          id: string
          languages: string[]
          last_reviewed_at: string | null
          legal_basis: Database["public"]["Enums"]["legal_basis"]
          linkedin_url: string | null
          location_city: string | null
          location_country: string | null
          location_region: string | null
          notes: string | null
          open_to_relocation: boolean
          organization_id: string
          owner_id: string
          passport_countries: string[]
          phone: string | null
          photo_path: string | null
          postal_code: string | null
          privacy_notice_given_at: string | null
          processing_purpose: string
          relocation_destinations: string[]
          relocation_scope: string | null
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
          travel_availability: string | null
          updated_at: string
          work_arrangements: Database["public"]["Enums"]["work_arrangement"][]
          work_authorization: string[]
          years_experience: number | null
        }
        Insert: {
          anonymized_at?: string | null
          available_from?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          has_passport?: boolean | null
          headline?: string | null
          id?: string
          languages?: string[]
          last_reviewed_at?: string | null
          legal_basis?: Database["public"]["Enums"]["legal_basis"]
          linkedin_url?: string | null
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          notes?: string | null
          open_to_relocation?: boolean
          organization_id: string
          owner_id: string
          passport_countries?: string[]
          phone?: string | null
          photo_path?: string | null
          postal_code?: string | null
          privacy_notice_given_at?: string | null
          processing_purpose?: string
          relocation_destinations?: string[]
          relocation_scope?: string | null
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
          travel_availability?: string | null
          updated_at?: string
          work_arrangements?: Database["public"]["Enums"]["work_arrangement"][]
          work_authorization?: string[]
          years_experience?: number | null
        }
        Update: {
          anonymized_at?: string | null
          available_from?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          has_passport?: boolean | null
          headline?: string | null
          id?: string
          languages?: string[]
          last_reviewed_at?: string | null
          legal_basis?: Database["public"]["Enums"]["legal_basis"]
          linkedin_url?: string | null
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          notes?: string | null
          open_to_relocation?: boolean
          organization_id?: string
          owner_id?: string
          passport_countries?: string[]
          phone?: string | null
          photo_path?: string | null
          postal_code?: string | null
          privacy_notice_given_at?: string | null
          processing_purpose?: string
          relocation_destinations?: string[]
          relocation_scope?: string | null
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
          travel_availability?: string | null
          updated_at?: string
          work_arrangements?: Database["public"]["Enums"]["work_arrangement"][]
          work_authorization?: string[]
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
          deemed_at: string | null
          id: string
          job_owner_bps: number
          origin: string
          platform_basis: Database["public"]["Enums"]["platform_basis"]
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
          terms_version_id: string | null
        }
        Insert: {
          created_at?: string
          deemed_at?: string | null
          id?: string
          job_owner_bps: number
          origin?: string
          platform_basis?: Database["public"]["Enums"]["platform_basis"]
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
          terms_version_id?: string | null
        }
        Update: {
          created_at?: string
          deemed_at?: string | null
          id?: string
          job_owner_bps?: number
          origin?: string
          platform_basis?: Database["public"]["Enums"]["platform_basis"]
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
          terms_version_id?: string | null
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
          {
            foreignKeyName: "collaboration_agreements_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "job_terms_versions"
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
          platform_basis: Database["public"]["Enums"]["platform_basis"]
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
          platform_basis?: Database["public"]["Enums"]["platform_basis"]
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
          platform_basis?: Database["public"]["Enums"]["platform_basis"]
          platform_bps?: number
          retired_at?: string | null
          sourcing_bps?: number
          version?: number
        }
        Relationships: []
      }
      connections: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          name: string
          next_sync_at: string
          organization_id: string
          owner_id: string
          provider: string
          secret_id: string | null
          status: string
          sync_interval_minutes: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name: string
          next_sync_at?: string
          organization_id: string
          owner_id: string
          provider: string
          secret_id?: string | null
          status?: string
          sync_interval_minutes?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          next_sync_at?: string
          organization_id?: string
          owner_id?: string
          provider?: string
          secret_id?: string | null
          status?: string
          sync_interval_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_owner_profile_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          claim_id: string | null
          created_at: string
          hire_report_id: string | null
          id: string
          kind: string
          opened_by: string
          opened_by_org: string
          outcome: string | null
          placement_id: string | null
          reason: string
          referral_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          claim_id?: string | null
          created_at?: string
          hire_report_id?: string | null
          id?: string
          kind?: string
          opened_by: string
          opened_by_org: string
          outcome?: string | null
          placement_id?: string | null
          reason: string
          referral_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          claim_id?: string | null
          created_at?: string
          hire_report_id?: string | null
          id?: string
          kind?: string
          opened_by?: string
          opened_by_org?: string
          outcome?: string | null
          placement_id?: string | null
          reason?: string
          referral_id?: string | null
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
          {
            foreignKeyName: "disputes_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      external_refs: {
        Row: {
          connection_id: string | null
          content_hash: string | null
          created_at: string
          entity_id: string
          entity_type: string
          external_id: string
          id: string
          organization_id: string
          seen_at: string
          source: string
        }
        Insert: {
          connection_id?: string | null
          content_hash?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          external_id: string
          id?: string
          organization_id: string
          seen_at?: string
          source: string
        }
        Update: {
          connection_id?: string | null
          content_hash?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          external_id?: string
          id?: string
          organization_id?: string
          seen_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_refs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_refs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hire_records: {
        Row: {
          created_at: string
          hired_role_title: string | null
          id: string
          kind: string
          offer_accepted_on: string | null
          origin: string
          placement_id: string | null
          prior_status: Database["public"]["Enums"]["referral_status"]
          recorded_by: string | null
          referral_id: string
          source_org_id: string
          start_date: string | null
          target_org_id: string
        }
        Insert: {
          created_at?: string
          hired_role_title?: string | null
          id?: string
          kind: string
          offer_accepted_on?: string | null
          origin: string
          placement_id?: string | null
          prior_status: Database["public"]["Enums"]["referral_status"]
          recorded_by?: string | null
          referral_id: string
          source_org_id: string
          start_date?: string | null
          target_org_id: string
        }
        Update: {
          created_at?: string
          hired_role_title?: string | null
          id?: string
          kind?: string
          offer_accepted_on?: string | null
          origin?: string
          placement_id?: string | null
          prior_status?: Database["public"]["Enums"]["referral_status"]
          recorded_by?: string | null
          referral_id?: string
          source_org_id?: string
          start_date?: string | null
          target_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hire_records_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: true
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hire_records_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hire_records_source_org_id_fkey"
            columns: ["source_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hire_records_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      job_terms_versions: {
        Row: {
          amends_version_id: string | null
          created_at: string
          created_by: string
          currency: string
          direct_client_attested_at: string
          direct_client_attested_by: string
          fee_basis: Database["public"]["Enums"]["fee_basis"]
          flat_fee_minor: number | null
          guarantee_days: number
          guarantee_remedy:
            | Database["public"]["Enums"]["guarantee_remedy"]
            | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["terms_kind"]
          min_fee_minor: number | null
          organization_id: string
          ownership_months: number
          payment_terms_days: number
          rate_bps: number | null
          referral_id: string | null
          search_type: Database["public"]["Enums"]["search_type"]
          version_no: number
        }
        Insert: {
          amends_version_id?: string | null
          created_at?: string
          created_by: string
          currency: string
          direct_client_attested_at: string
          direct_client_attested_by: string
          fee_basis: Database["public"]["Enums"]["fee_basis"]
          flat_fee_minor?: number | null
          guarantee_days: number
          guarantee_remedy?:
            | Database["public"]["Enums"]["guarantee_remedy"]
            | null
          id?: string
          job_id: string
          kind?: Database["public"]["Enums"]["terms_kind"]
          min_fee_minor?: number | null
          organization_id: string
          ownership_months: number
          payment_terms_days: number
          rate_bps?: number | null
          referral_id?: string | null
          search_type: Database["public"]["Enums"]["search_type"]
          version_no: number
        }
        Update: {
          amends_version_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          direct_client_attested_at?: string
          direct_client_attested_by?: string
          fee_basis?: Database["public"]["Enums"]["fee_basis"]
          flat_fee_minor?: number | null
          guarantee_days?: number
          guarantee_remedy?:
            | Database["public"]["Enums"]["guarantee_remedy"]
            | null
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["terms_kind"]
          min_fee_minor?: number | null
          organization_id?: string
          ownership_months?: number
          payment_terms_days?: number
          rate_bps?: number | null
          referral_id?: string | null
          search_type?: Database["public"]["Enums"]["search_type"]
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_terms_versions_amends_version_id_fkey"
            columns: ["amends_version_id"]
            isOneToOne: false
            referencedRelation: "job_terms_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_terms_versions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_terms_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_terms_versions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
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
          relocation_support: boolean
          required_skills: string[]
          salary_currency: string
          salary_max: number | null
          salary_min: number | null
          seniority: Database["public"]["Enums"]["seniority_level"] | null
          share_description: boolean
          share_fee: boolean
          share_location: boolean
          share_salary: boolean
          source: string
          status: Database["public"]["Enums"]["job_status"]
          title: string
          travel_requirement: string | null
          updated_at: string
          visa_sponsorship: boolean
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
          relocation_support?: boolean
          required_skills?: string[]
          salary_currency?: string
          salary_max?: number | null
          salary_min?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          share_description?: boolean
          share_fee?: boolean
          share_location?: boolean
          share_salary?: boolean
          source?: string
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          travel_requirement?: string | null
          updated_at?: string
          visa_sponsorship?: boolean
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
          relocation_support?: boolean
          required_skills?: string[]
          salary_currency?: string
          salary_max?: number | null
          salary_min?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          share_description?: boolean
          share_fee?: boolean
          share_location?: boolean
          share_salary?: boolean
          source?: string
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          travel_requirement?: string | null
          updated_at?: string
          visa_sponsorship?: boolean
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
      match_triage: {
        Row: {
          dismiss_reason: string | null
          match_id: string
          organization_id: string
          seen_at: string | null
          state: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dismiss_reason?: string | null
          match_id: string
          organization_id: string
          seen_at?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dismiss_reason?: string | null
          match_id?: string
          organization_id?: string
          seen_at?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_triage_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_triage_organization_id_fkey"
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
      network_rules_member_acceptances: {
        Row: {
          accepted_at: string
          id: string
          locale: Database["public"]["Enums"]["network_rules_locale"]
          organization_id: string | null
          sha256: string
          user_id: string
          version_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          locale: Database["public"]["Enums"]["network_rules_locale"]
          organization_id?: string | null
          sha256: string
          user_id: string
          version_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          locale?: Database["public"]["Enums"]["network_rules_locale"]
          organization_id?: string | null
          sha256?: string
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_rules_member_acceptances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_rules_member_acceptances_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "network_rules_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      network_rules_org_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string | null
          id: string
          locale: Database["public"]["Enums"]["network_rules_locale"]
          organization_id: string
          sha256: string
          version_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by?: string | null
          id?: string
          locale: Database["public"]["Enums"]["network_rules_locale"]
          organization_id: string
          sha256: string
          version_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["network_rules_locale"]
          organization_id?: string
          sha256?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_rules_org_acceptances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_rules_org_acceptances_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "network_rules_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      network_rules_version_texts: {
        Row: {
          body: string
          change_summary: string | null
          locale: Database["public"]["Enums"]["network_rules_locale"]
          rules: Json
          sections: Json
          sha256: string
          version_id: string
        }
        Insert: {
          body: string
          change_summary?: string | null
          locale: Database["public"]["Enums"]["network_rules_locale"]
          rules?: Json
          sections?: Json
          sha256: string
          version_id: string
        }
        Update: {
          body?: string
          change_summary?: string | null
          locale?: Database["public"]["Enums"]["network_rules_locale"]
          rules?: Json
          sections?: Json
          sha256?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_rules_version_texts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "network_rules_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      network_rules_versions: {
        Row: {
          approval_reference: string | null
          created_at: string
          effective_at: string | null
          effective_on: string | null
          id: string
          label: string
          legal_reason: string | null
          published_at: string | null
          rule_numbers: string[]
          status: string
          type: Database["public"]["Enums"]["network_rules_version_type"]
          updated_at: string
        }
        Insert: {
          approval_reference?: string | null
          created_at?: string
          effective_at?: string | null
          effective_on?: string | null
          id?: string
          label: string
          legal_reason?: string | null
          published_at?: string | null
          rule_numbers?: string[]
          status?: string
          type: Database["public"]["Enums"]["network_rules_version_type"]
          updated_at?: string
        }
        Update: {
          approval_reference?: string | null
          created_at?: string
          effective_at?: string | null
          effective_on?: string | null
          id?: string
          label?: string
          legal_reason?: string | null
          published_at?: string | null
          rule_numbers?: string[]
          status?: string
          type?: Database["public"]["Enums"]["network_rules_version_type"]
          updated_at?: string
        }
        Relationships: []
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
          terminated_at: string | null
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
          terminated_at?: string | null
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
          terminated_at?: string | null
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
          computed_fee_minor: number | null
          contracted_fee_minor: number | null
          created_at: string
          currency: string | null
          established_at: string | null
          established_how: string | null
          fee_details_due_at: string | null
          fee_details_entered_at: string | null
          fee_difference_note: string | null
          fee_difference_reason: string | null
          guarantee_until: string | null
          id: string
          invoice_due_at: string | null
          referral_id: string
          reported_base_minor: number | null
          reported_bonus_minor: number | null
          reported_by: string | null
          settled_at: string | null
          source_org_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["placement_status"]
          status_before_dispute:
            | Database["public"]["Enums"]["placement_status"]
            | null
          target_org_id: string
          terms_version_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          agreement_id: string
          computed_fee_minor?: number | null
          contracted_fee_minor?: number | null
          created_at?: string
          currency?: string | null
          established_at?: string | null
          established_how?: string | null
          fee_details_due_at?: string | null
          fee_details_entered_at?: string | null
          fee_difference_note?: string | null
          fee_difference_reason?: string | null
          guarantee_until?: string | null
          id?: string
          invoice_due_at?: string | null
          referral_id: string
          reported_base_minor?: number | null
          reported_bonus_minor?: number | null
          reported_by?: string | null
          settled_at?: string | null
          source_org_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["placement_status"]
          status_before_dispute?:
            | Database["public"]["Enums"]["placement_status"]
            | null
          target_org_id: string
          terms_version_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          agreement_id?: string
          computed_fee_minor?: number | null
          contracted_fee_minor?: number | null
          created_at?: string
          currency?: string | null
          established_at?: string | null
          established_how?: string | null
          fee_details_due_at?: string | null
          fee_details_entered_at?: string | null
          fee_difference_note?: string | null
          fee_difference_reason?: string | null
          guarantee_until?: string | null
          id?: string
          invoice_due_at?: string | null
          referral_id?: string
          reported_base_minor?: number | null
          reported_bonus_minor?: number | null
          reported_by?: string | null
          settled_at?: string | null
          source_org_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["placement_status"]
          status_before_dispute?:
            | Database["public"]["Enums"]["placement_status"]
            | null
          target_org_id?: string
          terms_version_id?: string | null
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
          {
            foreignKeyName: "placements_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "job_terms_versions"
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
          consent_id: string | null
          created_at: string
          organization_id: string
          referral_id: string
        }
        Insert: {
          candidate_id: string
          consent_id?: string | null
          created_at?: string
          organization_id: string
          referral_id: string
        }
        Update: {
          candidate_id?: string
          consent_id?: string | null
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
      referral_candidate_requests: {
        Row: {
          candidate_id: string
          channel: string
          confirmed_at: string | null
          consent_id: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          destination: string
          expires_at: string
          last_attempt_at: string | null
          last_send_error: string | null
          note: string | null
          organization_id: string
          profile_changes: string[]
          referral_id: string
          requested_document_ids: string[]
          requested_fields: string[]
          response_meta: Json
          send_count: number
          sent_at: string | null
          token_hash: string | null
          token_issued_at: string | null
          token_issued_by: string | null
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          candidate_id: string
          channel?: string
          confirmed_at?: string | null
          consent_id?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          destination: string
          expires_at: string
          last_attempt_at?: string | null
          last_send_error?: string | null
          note?: string | null
          organization_id: string
          profile_changes?: string[]
          referral_id: string
          requested_document_ids?: string[]
          requested_fields: string[]
          response_meta?: Json
          send_count?: number
          sent_at?: string | null
          token_hash?: string | null
          token_issued_at?: string | null
          token_issued_by?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          candidate_id?: string
          channel?: string
          confirmed_at?: string | null
          consent_id?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          destination?: string
          expires_at?: string
          last_attempt_at?: string | null
          last_send_error?: string | null
          note?: string | null
          organization_id?: string
          profile_changes?: string[]
          referral_id?: string
          requested_document_ids?: string[]
          requested_fields?: string[]
          response_meta?: Json
          send_count?: number
          sent_at?: string | null
          token_hash?: string | null
          token_issued_at?: string | null
          token_issued_by?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_candidate_requests_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_candidate_requests_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "candidate_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_candidate_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_candidate_requests_referral_id_fkey"
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
          actor_kind: string | null
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
          actor_kind?: string | null
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
          actor_kind?: string | null
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
          claim_deadline_at: string | null
          claim_rejected_at: string | null
          commission_rule_id: string | null
          created_at: string
          decided_at: string | null
          decline_reason: string | null
          delivered_at: string | null
          fee_estimate_minor: number | null
          fit_evidence: Json
          fit_score: number | null
          id: string
          idempotency_key: string
          internal: boolean
          job_id: string
          job_title_snapshot: string
          ownership_protected_until: string | null
          review_clock_started_at: string | null
          sharing_revoked_at: string | null
          source_org_id: string
          source_user_id: string
          status: Database["public"]["Enums"]["referral_status"]
          submitted_at: string
          target_org_id: string
          terms_version_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          candidate_label: string
          claim_deadline_at?: string | null
          claim_rejected_at?: string | null
          commission_rule_id?: string | null
          created_at?: string
          decided_at?: string | null
          decline_reason?: string | null
          delivered_at?: string | null
          fee_estimate_minor?: number | null
          fit_evidence?: Json
          fit_score?: number | null
          id?: string
          idempotency_key: string
          internal?: boolean
          job_id: string
          job_title_snapshot: string
          ownership_protected_until?: string | null
          review_clock_started_at?: string | null
          sharing_revoked_at?: string | null
          source_org_id: string
          source_user_id: string
          status?: Database["public"]["Enums"]["referral_status"]
          submitted_at?: string
          target_org_id: string
          terms_version_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          candidate_label?: string
          claim_deadline_at?: string | null
          claim_rejected_at?: string | null
          commission_rule_id?: string | null
          created_at?: string
          decided_at?: string | null
          decline_reason?: string | null
          delivered_at?: string | null
          fee_estimate_minor?: number | null
          fit_evidence?: Json
          fit_score?: number | null
          id?: string
          idempotency_key?: string
          internal?: boolean
          job_id?: string
          job_title_snapshot?: string
          ownership_protected_until?: string | null
          review_clock_started_at?: string | null
          sharing_revoked_at?: string | null
          source_org_id?: string
          source_user_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
          submitted_at?: string
          target_org_id?: string
          terms_version_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "referrals_commission_rule_id_fkey"
            columns: ["commission_rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "referrals_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "job_terms_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_relations: {
        Row: {
          created_at: string
          model: string
          related: string[]
          skill: string
        }
        Insert: {
          created_at?: string
          model: string
          related?: string[]
          skill: string
        }
        Update: {
          created_at?: string
          model?: string
          related?: string[]
          skill?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          closed_count: number
          connection_id: string
          created_count: number
          error: string | null
          failed_count: number
          finished_at: string | null
          id: string
          organization_id: string
          started_at: string
          status: string
          trigger: string
          unchanged_count: number
          updated_count: number
        }
        Insert: {
          closed_count?: number
          connection_id: string
          created_count?: number
          error?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          organization_id: string
          started_at?: string
          status?: string
          trigger: string
          unchanged_count?: number
          updated_count?: number
        }
        Update: {
          closed_count?: number
          connection_id?: string
          created_count?: number
          error?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          organization_id?: string
          started_at?: string
          status?: string
          trigger?: string
          unchanged_count?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_organization_id_fkey"
            columns: ["organization_id"]
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
      accept_network_rules: {
        Args: {
          p_for_org: boolean
          p_locale: string
          p_org: string
          p_personal: boolean
          p_version: string
        }
        Returns: Json
      }
      admin_amend_referral_terms: {
        Args: {
          p_both_requested: boolean
          p_expected_currency?: string
          p_fee_basis: Database["public"]["Enums"]["fee_basis"]
          p_flat_currency?: string
          p_flat_fee_minor?: number
          p_guarantee_days: number
          p_guarantee_remedy?: Database["public"]["Enums"]["guarantee_remedy"]
          p_hiring_request_reference: string
          p_min_fee_minor?: number
          p_ownership_months: number
          p_payment_terms_days: number
          p_rate_bps?: number
          p_reason: string
          p_referral: string
          p_search_type: Database["public"]["Enums"]["search_type"]
          p_sourcing_request_reference: string
        }
        Returns: string
      }
      admin_apply_immediate_hold: {
        Args: {
          p_allegation: string
          p_alleged_when: string
          p_case: string
          p_conduct_date: string
          p_evidence_summary: string
          p_ground: string
          p_language: string
          p_name_reporter?: boolean
          p_rules_cited: string[]
          p_rules_version: string
        }
        Returns: Json
      }
      admin_close_conduct_case: {
        Args: { p_case: string; p_reason: string; p_reason_code: string }
        Returns: undefined
      }
      admin_close_stale_referral: {
        Args: { p_reason: string; p_referral: string }
        Returns: undefined
      }
      admin_conduct_incident_options: {
        Args: { p_case: string }
        Returns: Json
      }
      admin_conduct_notice_context: {
        Args: { p_case: string; p_conduct_date?: string }
        Returns: Json
      }
      admin_decide_authorization_check: {
        Args: {
          p_candidate_contacted?: boolean
          p_check: string
          p_resolution: string
          p_valid: boolean
        }
        Returns: undefined
      }
      admin_decide_conduct_case: {
        Args: {
          p_case: string
          p_finding: string
          p_level: string
          p_notice: string
          p_outcome: string
          p_planned_review_on?: string
          p_residual: boolean
          p_rules_cited: string[]
          p_why_not_hold?: string
        }
        Returns: string
      }
      admin_decide_hire_report: {
        Args: {
          p_finding?: string
          p_outcome: string
          p_report: string
          p_resolution: string
        }
        Returns: Json
      }
      admin_decide_sanction_review: {
        Args: {
          p_new_level: string
          p_outcome: string
          p_reason: string
          p_review: string
        }
        Returns: undefined
      }
      admin_get_authorization_checks: {
        Args: { p_referral: string }
        Returns: Json
      }
      admin_get_conduct_case: { Args: { p_case: string }; Returns: Json }
      admin_get_hire_record: { Args: { p_referral: string }; Returns: Json }
      admin_get_hire_report: { Args: { p_report: string }; Returns: Json }
      admin_get_network_rules_version: {
        Args: { p_version: string }
        Returns: Json
      }
      admin_get_referral_terms: { Args: { p_referral: string }; Returns: Json }
      admin_hire_report_flags: {
        Args: never
        Returns: {
          organization_id: string
          organization_name: string
          rejected_90d: number
        }[]
      }
      admin_lift_sanction: {
        Args: { p_org: string; p_reason: string; p_sanction: string }
        Returns: undefined
      }
      admin_list_conduct_cases: {
        Args: { p_open_only?: boolean }
        Returns: Json
      }
      admin_list_hire_reports: {
        Args: never
        Returns: {
          candidate_label: string
          deadline: string
          deadline_business_days_left: number
          filed_at: string
          finding: string
          id: string
          job_title: string
          overdue: boolean
          referral_id: string
          resolved_at: string
          row_kind: string
          section: string
          source_org_id: string
          source_org_name: string
          source_suspended: boolean
          status: string
          target_org_id: string
          target_org_name: string
          target_suspended: boolean
        }[]
      }
      admin_list_hire_tasks: {
        Args: never
        Returns: {
          candidate_label: string
          fee_details_due_at: string
          job_title: string
          notice_note: string
          notice_sent_on: string
          offer_accepted_on: string
          placement_id: string
          recorded_at: string
          referral_id: string
          source_org_id: string
          source_org_name: string
          start_date: string
          target_org_id: string
          target_org_name: string
          task: string
        }[]
      }
      admin_list_network_rules: { Args: never; Returns: Json }
      admin_open_authorization_check: {
        Args: {
          p_challenger_evidence?: boolean
          p_referral: string
          p_requested_by: string
        }
        Returns: Json
      }
      admin_open_conduct_case: {
        Args: {
          p_admin_source: string
          p_category: string
          p_description: string
          p_file_ids?: string[]
          p_org: string
          p_referral: string
        }
        Returns: string
      }
      admin_org_conduct_file: { Args: { p_org: string }; Returns: Json }
      admin_record_fee_notice: {
        Args: { p_note?: string; p_placement: string; p_sent_on: string }
        Returns: undefined
      }
      admin_request_conduct_info: {
        Args: {
          p_case: string
          p_due_business_days?: number
          p_question: string
        }
        Returns: undefined
      }
      admin_send_conduct_followup: {
        Args: {
          p_due_business_days?: number
          p_notice: string
          p_question: string
        }
        Returns: string
      }
      admin_send_conduct_notice: {
        Args: {
          p_allegation: string
          p_alleged_when: string
          p_case: string
          p_conduct_date: string
          p_evidence_summary: string
          p_language: string
          p_name_reporter?: boolean
          p_rules_cited: string[]
          p_rules_version: string
        }
        Returns: string
      }
      admin_send_incident_notice: {
        Args: {
          p_case: string
          p_information: string
          p_language: string
          p_recipient_orgs: string[]
          p_referrals: string[]
          p_to_whom: string
          p_when: string
        }
        Returns: string
      }
      admin_set_conduct_category: {
        Args: { p_case: string; p_category: string }
        Returns: undefined
      }
      admin_set_hire_record_note: {
        Args: { p_note: string; p_referral: string }
        Returns: undefined
      }
      admin_set_hire_report_fields: {
        Args: {
          p_candidate_contacts: number
          p_client_confirmation: string
          p_note: string
          p_report: string
        }
        Returns: undefined
      }
      anonymize_candidate: {
        Args: { p_candidate: string; p_reason: string }
        Returns: undefined
      }
      api_key_authenticate: {
        Args: { p_hash: string }
        Returns: {
          allowed: boolean
          created_by: string
          key_id: string
          organization_id: string
        }[]
      }
      audit_document_access: {
        Args: { p_document: string }
        Returns: undefined
      }
      authorize_claim_evidence: {
        Args: { p_acting_org?: string; p_file: string }
        Returns: string
      }
      authorize_conduct_evidence: { Args: { p_file: string }; Returns: string }
      authorize_hire_evidence: {
        Args: { p_acting_org?: string; p_file: string }
        Returns: string
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
      claim_evidence_scan_target: { Args: { p_file: string }; Returns: Json }
      compare_dispute_contacts: { Args: { p_dispute: string }; Returns: Json }
      complete_background_job: { Args: { p_id: string }; Returns: undefined }
      complete_fee_details: {
        Args: {
          p_base_minor?: number
          p_bonus_minor?: number
          p_difference_note?: string
          p_difference_reason?: string
          p_expected_version: number
          p_invoiced_fee_minor?: number
          p_legacy_currency?: string
          p_legacy_fee_minor?: number
          p_legacy_guarantee_days?: number
          p_placement: string
          p_start_date: string
          p_terms_version?: string
        }
        Returns: undefined
      }
      conduct_evidence_scan_target: { Args: { p_file: string }; Returns: Json }
      confirm_agreement: { Args: { p_referral: string }; Returns: undefined }
      connection_get_secret: { Args: { p_connection: string }; Returns: string }
      connection_set_secret: {
        Args: { p_connection: string; p_secret: string }
        Returns: undefined
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      contest_hire_report: {
        Args: {
          p_acting_org: string
          p_attested: boolean
          p_file_ids: string[]
          p_offer_accepted_on: string
          p_process_started_on: string
          p_reason: string
          p_report: string
          p_statement: string
        }
        Returns: Json
      }
      contest_prior_presentation_claim: {
        Args: { p_acting_org: string; p_reason: string; p_referral: string }
        Returns: string
      }
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
          p_accept_member?: boolean
          p_accept_org?: boolean
          p_kind?: Database["public"]["Enums"]["organization_kind"]
          p_name: string
          p_rules_locale?: string
          p_rules_version?: string
          p_slug: string
        }
        Returns: string
      }
      deactivate_member_in_settlement: {
        Args: { p_membership: string; p_org: string }
        Returns: undefined
      }
      decline_pending_for_job: { Args: { p_job: string }; Returns: number }
      decline_referrals: {
        Args: { p_ids: string[]; p_note?: string; p_reason_code: string }
        Returns: number
      }
      delete_network_rules_draft: {
        Args: { p_draft: string }
        Returns: undefined
      }
      enqueue_due_connector_syncs: { Args: never; Returns: number }
      fail_background_job: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      file_conduct_report: {
        Args: {
          p_attested: boolean
          p_category: string
          p_description: string
          p_file_ids?: string[]
          p_match: string
          p_occurred_approx: boolean
          p_occurred_on: string
          p_org: string
          p_referral: string
        }
        Returns: Json
      }
      file_hire_report: {
        Args: {
          p_acting_org: string
          p_attested: boolean
          p_employer: string
          p_file_ids: string[]
          p_items: Json
          p_learned_via: string
          p_referral: string
          p_role: string
          p_start_month: string
          p_statement: string
          p_tail_statement: boolean
        }
        Returns: Json
      }
      file_prior_presentation_claim: {
        Args: {
          p_acting_org?: string
          p_attested?: boolean
          p_evidence_kind: string
          p_evidence_referral?: string
          p_expected_version: number
          p_file_ids: string[]
          p_note?: string
          p_prior_process_date?: string
          p_referral: string
        }
        Returns: Json
      }
      finalize_due_claims: { Args: never; Returns: number }
      forget_claim_files: { Args: { p_paths: string[] }; Returns: number }
      get_candidate_request: { Args: { p_token: string }; Returns: Json }
      get_conduct_case_for_org: {
        Args: { p_case: string; p_org: string }
        Returns: Json
      }
      get_conduct_report: {
        Args: { p_case: string; p_org: string }
        Returns: Json
      }
      get_conduct_report_context: {
        Args: { p_match?: string; p_org: string; p_referral?: string }
        Returns: Json
      }
      get_hire_reports: {
        Args: { p_acting_org: string; p_referral: string }
        Returns: Json
      }
      get_incident_notice: {
        Args: { p_notice: string; p_org: string }
        Returns: Json
      }
      get_job_match_summary: {
        Args: { p_job: string }
        Returns: {
          last_refreshed_at: string
          potential_count: number
          strong_count: number
        }[]
      }
      get_jobs_terms_state: {
        Args: { p_job?: string; p_org: string }
        Returns: {
          attested_at: string
          attested_by_name: string
          currency: string
          fee_basis: Database["public"]["Enums"]["fee_basis"]
          flat_fee_minor: number
          guarantee_days: number
          guarantee_remedy: Database["public"]["Enums"]["guarantee_remedy"]
          hidden_reason: string
          job_id: string
          min_fee_minor: number
          ownership_months: number
          partner_visible: boolean
          payment_terms_days: number
          published_at: string
          published_by_name: string
          rate_bps: number
          referral_count: number
          search_type: Database["public"]["Enums"]["search_type"]
          terms_version_id: string
          version_no: number
        }[]
      }
      get_my_org_state: { Args: { p_org: string }; Returns: Json }
      get_network_standing: { Args: { p_org: string }; Returns: Json }
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
          dismiss_reason: string
          estimated_fee_minor: number
          estimated_share_minor: number
          fee_basis: Database["public"]["Enums"]["fee_basis"]
          fee_currency: string
          flat_fee_minor: number
          gaps: Json
          guarantee_days: number
          guarantee_remedy: Database["public"]["Enums"]["guarantee_remedy"]
          internal: boolean
          is_new: boolean
          job_id: string
          job_org_name: string
          job_owner_bps: number
          job_posted_at: string
          job_title: string
          location: string
          match_id: string
          matched_at: string
          min_fee_minor: number
          model_version: string
          ownership_months: number
          payment_terms_days: number
          platform_bps: number
          preferred_skills: string[]
          rate_bps: number
          reasons: Json
          referral_id: string
          referral_status: string
          refreshed_at: string
          required_skills: string[]
          rule_name: string
          rule_version: number
          salary_currency: string
          salary_max: number
          salary_min: number
          score: number
          search_type: Database["public"]["Enums"]["search_type"]
          seniority: Database["public"]["Enums"]["seniority_level"]
          sourcing_bps: number
          terms_published_at: string
          terms_updated_at: string
          terms_version_id: string
          terms_version_no: number
          triage_state: string
          work_arrangement: Database["public"]["Enums"]["work_arrangement"]
        }[]
      }
      get_partner_job_availability: {
        Args: { p_job?: string; p_match?: string; p_org: string }
        Returns: Json
      }
      get_placement_fee_state: { Args: { p_placement: string }; Returns: Json }
      get_referral_dispute: { Args: { p_dispute: string }; Returns: Json }
      get_referral_hire_state: {
        Args: { p_acting_org?: string; p_referral: string }
        Returns: Json
      }
      get_referral_presentation: {
        Args: { p_acting_org: string; p_referral: string }
        Returns: Json
      }
      get_referral_terms_context: {
        Args: { p_referral: string }
        Returns: {
          job_current_version_at: string
          job_current_version_no: number
        }[]
      }
      get_sent_referral_jobs: {
        Args: { p_org: string }
        Returns: {
          internal: boolean
          job_id: string
          status: Database["public"]["Enums"]["job_status"]
          status_updated_at: string
        }[]
      }
      get_settlement_summary: { Args: { p_org: string }; Returns: Json }
      get_stop_by_reference: { Args: { p_reference: string }; Returns: Json }
      hire_evidence_scan_target: { Args: { p_file: string }; Returns: Json }
      issue_candidate_request_token: {
        Args: { p_actor: string; p_referral: string }
        Returns: string
      }
      list_claim_evidence_files: {
        Args: { p_acting_org: string; p_referral: string }
        Returns: Json
      }
      list_claim_evidence_referrals: {
        Args: { p_acting_org: string; p_referral: string }
        Returns: Json
      }
      list_conduct_draft_files: { Args: { p_ids?: string[] }; Returns: Json }
      list_hire_evidence_files: {
        Args: { p_acting_org: string; p_owner_kind: string; p_referral: string }
        Returns: Json
      }
      list_my_conduct_reports: {
        Args: { p_org: string; p_referral?: string; p_scope?: string }
        Returns: Json
      }
      list_my_organizations: {
        Args: never
        Returns: {
          id: string
          is_demo: boolean
          name: string
          role: Database["public"]["Enums"]["membership_role"]
          settlement_mode: boolean
          slug: string
        }[]
      }
      mark_grant_copied: {
        Args: { p_grant: string; p_ok: boolean; p_path: string }
        Returns: undefined
      }
      mark_matches_seen: {
        Args: { p_matches: string[]; p_org: string }
        Returns: undefined
      }
      open_dispute: {
        Args: { p_placement: string; p_reason: string }
        Returns: string
      }
      platform_metrics: {
        Args: never
        Returns: {
          active_candidates: number
          active_jobs: number
          open_disputes: number
          organizations: number
          pending_evidence: number
          placements: number
          referrals: number
        }[]
      }
      presentation_abuse_flags: {
        Args: never
        Returns: {
          organization_id: string
          organization_name: string
          rejected_claims_90d: number
          stops_7d: number
        }[]
      }
      presentation_admin_metrics: { Args: { p_days?: number }; Returns: Json }
      publish_commission_rule: {
        Args: {
          p_job_owner: number
          p_name: string
          p_platform: number
          p_platform_basis?: Database["public"]["Enums"]["platform_basis"]
          p_sourcing: number
        }
        Returns: string
      }
      publish_network_rules_version: {
        Args: {
          p_approval_reference: string
          p_draft?: string
          p_effective_on: string
          p_label: string
          p_legal_reason: string
          p_summaries: Json
          p_texts: Json
          p_type: string
        }
        Returns: string
      }
      purge_orphan_claim_files: { Args: never; Returns: string[] }
      purge_orphan_conduct_files: { Args: never; Returns: string[] }
      purge_orphan_hire_files: { Args: never; Returns: string[] }
      purge_presentation_data: { Args: never; Returns: Json }
      rebut_hire_report: {
        Args: {
          p_acting_org: string
          p_attested: boolean
          p_file_ids: string[]
          p_items: Json
          p_report: string
          p_statement: string
        }
        Returns: Json
      }
      record_candidate_request_delivery: {
        Args: {
          p_actor: string
          p_error?: string
          p_ok: boolean
          p_referral: string
        }
        Returns: undefined
      }
      record_claim_evidence_scan: {
        Args: { p_file: string; p_sha256: string; p_verdict: string }
        Returns: undefined
      }
      record_conduct_evidence_scan: {
        Args: { p_file: string; p_sha256: string; p_verdict: string }
        Returns: undefined
      }
      record_hire_evidence_scan: {
        Args: { p_file: string; p_sha256: string; p_verdict: string }
        Returns: undefined
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
      register_claim_evidence: {
        Args: {
          p_acting_org: string
          p_file_name: string
          p_referral: string
          p_storage_path: string
        }
        Returns: Json
      }
      register_conduct_evidence: {
        Args: { p_file_name: string; p_storage_path: string }
        Returns: Json
      }
      register_hire_evidence: {
        Args: {
          p_acting_org: string
          p_file_name: string
          p_owner_kind: string
          p_referral: string
          p_storage_path: string
        }
        Returns: Json
      }
      release_referral: {
        Args: { p_acting_org?: string; p_referral: string }
        Returns: undefined
      }
      remove_claim_evidence: {
        Args: { p_acting_org: string; p_file: string }
        Returns: string
      }
      remove_conduct_draft_file: { Args: { p_file: string }; Returns: string }
      remove_hire_evidence: {
        Args: { p_acting_org: string; p_file: string }
        Returns: string
      }
      reply_conduct_followup: {
        Args: {
          p_body: string
          p_file_ids?: string[]
          p_followup: string
          p_org: string
        }
        Returns: undefined
      }
      reply_conduct_info_request: {
        Args: {
          p_body: string
          p_case: string
          p_file_ids?: string[]
          p_org: string
        }
        Returns: undefined
      }
      report_hire: {
        Args: {
          p_base_minor?: number
          p_bonus_minor?: number
          p_difference_note?: string
          p_difference_reason?: string
          p_expected_version: number
          p_hired_role_title?: string
          p_invoiced_fee_minor?: number
          p_legacy_currency?: string
          p_legacy_fee_minor?: number
          p_legacy_guarantee_days?: number
          p_offer_accepted_on?: string
          p_referral: string
          p_report?: string
          p_start_date: string
          p_terms_version?: string
        }
        Returns: string
      }
      request_authorization_check: {
        Args: {
          p_acting_org: string
          p_file_ids?: string[]
          p_reason: string
          p_referral: string
        }
        Returns: Json
      }
      request_connection_sync: {
        Args: { p_connection: string }
        Returns: undefined
      }
      request_sanction_review: {
        Args: {
          p_case: string
          p_file_ids?: string[]
          p_org: string
          p_text: string
        }
        Returns: string
      }
      resolve_dispute: {
        Args: { p_dispute: string; p_resolution: string; p_upheld: boolean }
        Returns: undefined
      }
      resolve_prior_presentation_dispute: {
        Args: {
          p_claim_upheld: boolean
          p_dispute: string
          p_resolution: string
        }
        Returns: undefined
      }
      respond_candidate_request: {
        Args: {
          p_accept: boolean
          p_meta?: Json
          p_profile?: Json
          p_reason?: string
          p_token: string
        }
        Returns: string
      }
      review_payment_evidence: {
        Args: { p_approve: boolean; p_evidence: string; p_note: string }
        Returns: undefined
      }
      review_referral: {
        Args: {
          p_acting_org?: string
          p_expected_version: number
          p_note: string
          p_reason_code: string
          p_referral: string
          p_to: Database["public"]["Enums"]["referral_status"]
        }
        Returns: number
      }
      rotate_candidate_request_token: {
        Args: { p_referral: string; p_ttl_days?: number }
        Returns: string
      }
      rotate_fingerprint_key: { Args: never; Returns: Json }
      run_hire_maintenance: { Args: never; Returns: Json }
      save_job_terms: {
        Args: {
          p_attested?: boolean
          p_fee_basis?: Database["public"]["Enums"]["fee_basis"]
          p_flat_currency?: string
          p_flat_fee_minor?: number
          p_guarantee_days?: number
          p_guarantee_remedy?: Database["public"]["Enums"]["guarantee_remedy"]
          p_job: string
          p_min_fee_minor?: number
          p_open: boolean
          p_ownership_months?: number
          p_payment_terms_days?: number
          p_rate_bps?: number
          p_search_type?: Database["public"]["Enums"]["search_type"]
        }
        Returns: {
          created: boolean
          notified_orgs: number
          terms_version_id: string
          version_no: number
        }[]
      }
      save_network_rules_draft: {
        Args: {
          p_approval_reference?: string
          p_draft: string
          p_effective_on: string
          p_label: string
          p_legal_reason?: string
          p_summaries: Json
          p_texts: Json
          p_type: string
        }
        Returns: string
      }
      set_match_triage: {
        Args: {
          p_match: string
          p_org: string
          p_reason?: string
          p_state: string
        }
        Returns: undefined
      }
      submit_authorization_evidence: {
        Args: {
          p_acting_org: string
          p_attested: boolean
          p_check: string
          p_file_ids: string[]
          p_statement: string
        }
        Returns: undefined
      }
      submit_conduct_response: {
        Args: {
          p_body: string
          p_file_ids?: string[]
          p_notice: string
          p_org: string
        }
        Returns: undefined
      }
      submit_referral: {
        Args: {
          p_acknowledge_pending?: boolean
          p_candidate: string
          p_consent: string
          p_document_ids: string[]
          p_fields: string[]
          p_idempotency_key: string
          p_job: string
          p_new_consent?: Json
          p_note?: string
          p_terms_version: string
        }
        Returns: {
          outcome: string
          reference: string
          referral_id: string
        }[]
      }
      submit_referral_for_candidate: {
        Args: {
          p_acknowledge_pending?: boolean
          p_candidate: string
          p_document_ids: string[]
          p_fields: string[]
          p_idempotency_key: string
          p_job: string
          p_note?: string
          p_terms_version: string
          p_ttl_days?: number
        }
        Returns: {
          created: boolean
          destination: string
          outcome: string
          reference: string
          referral_id: string
        }[]
      }
      transfer_member_portfolio: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: Json
      }
      transition_referral: {
        Args: {
          p_acting_org?: string
          p_expected_version: number
          p_reason: string
          p_referral: string
          p_to: Database["public"]["Enums"]["referral_status"]
        }
        Returns: number
      }
      withdraw_referral: {
        Args: {
          p_acting_org?: string
          p_expected_version: number
          p_reason: string
          p_referral: string
          p_release?: boolean
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
      fee_basis: "pct_base" | "pct_total_cash" | "flat"
      guarantee_remedy:
        | "replacement_only"
        | "replacement_then_prorata"
        | "prorata_refund"
        | "full_refund"
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
      network_rules_locale: "en" | "fr-CA" | "pt-BR"
      network_rules_version_type:
        | "initial"
        | "material"
        | "non_material"
        | "legally_required"
      organization_kind: "agency" | "independent"
      placement_status:
        | "fee_pending"
        | "hire_reported"
        | "invoiced"
        | "payment_partially_verified"
        | "commission_payable"
        | "settled"
        | "disputed"
        | "cancelled"
      platform_basis: "collected" | "frozen"
      referral_side: "source" | "target"
      referral_status:
        | "awaiting_candidate"
        | "candidate_declined"
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
        | "already_presented"
      search_type: "contingent_exclusive" | "contingent_shared" | "retained"
      seniority_level:
        | "intern"
        | "junior"
        | "mid"
        | "senior"
        | "lead"
        | "principal"
        | "executive"
      terms_kind: "job" | "amendment"
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
      fee_basis: ["pct_base", "pct_total_cash", "flat"],
      guarantee_remedy: [
        "replacement_only",
        "replacement_then_prorata",
        "prorata_refund",
        "full_refund",
      ],
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
      network_rules_locale: ["en", "fr-CA", "pt-BR"],
      network_rules_version_type: [
        "initial",
        "material",
        "non_material",
        "legally_required",
      ],
      organization_kind: ["agency", "independent"],
      placement_status: [
        "fee_pending",
        "hire_reported",
        "invoiced",
        "payment_partially_verified",
        "commission_payable",
        "settled",
        "disputed",
        "cancelled",
      ],
      platform_basis: ["collected", "frozen"],
      referral_side: ["source", "target"],
      referral_status: [
        "awaiting_candidate",
        "candidate_declined",
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
        "already_presented",
      ],
      search_type: ["contingent_exclusive", "contingent_shared", "retained"],
      seniority_level: [
        "intern",
        "junior",
        "mid",
        "senior",
        "lead",
        "principal",
        "executive",
      ],
      terms_kind: ["job", "amendment"],
      work_arrangement: ["remote", "hybrid", "onsite"],
    },
  },
} as const

