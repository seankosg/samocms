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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity: string
          activity_no: string | null
          actual_progress: number | null
          baseline_date: string
          building: string | null
          created_at: string
          discipline: string
          done_quantity: number | null
          finish_date: string | null
          id: number
          manager: string | null
          milestone: string | null
          planned_progress: number | null
          predecessor: string | null
          room: string | null
          source_file: string
          start_date: string | null
          subcontractor: string | null
          successor: string | null
          total_quantity: number | null
          unit: string | null
          work_scope: string | null
        }
        Insert: {
          activity: string
          activity_no?: string | null
          actual_progress?: number | null
          baseline_date?: string
          building?: string | null
          created_at?: string
          discipline: string
          done_quantity?: number | null
          finish_date?: string | null
          id?: number
          manager?: string | null
          milestone?: string | null
          planned_progress?: number | null
          predecessor?: string | null
          room?: string | null
          source_file: string
          start_date?: string | null
          subcontractor?: string | null
          successor?: string | null
          total_quantity?: number | null
          unit?: string | null
          work_scope?: string | null
        }
        Update: {
          activity?: string
          activity_no?: string | null
          actual_progress?: number | null
          baseline_date?: string
          building?: string | null
          created_at?: string
          discipline?: string
          done_quantity?: number | null
          finish_date?: string | null
          id?: number
          manager?: string | null
          milestone?: string | null
          planned_progress?: number | null
          predecessor?: string | null
          room?: string | null
          source_file?: string
          start_date?: string | null
          subcontractor?: string | null
          successor?: string | null
          total_quantity?: number | null
          unit?: string | null
          work_scope?: string | null
        }
        Relationships: []
      }
      activity_daily_progress: {
        Row: {
          activity: string | null
          actual_delta: number | null
          actual_progress: number | null
          discipline: string
          id: number
          item_key: string
          plan_delta: number | null
          planned_progress: number | null
          prev_actual_progress: number | null
          prev_date: string | null
          prev_planned_progress: number | null
          snapshot_date: string
          source_file: string | null
          updated_at: string
        }
        Insert: {
          activity?: string | null
          actual_delta?: number | null
          actual_progress?: number | null
          discipline: string
          id?: number
          item_key: string
          plan_delta?: number | null
          planned_progress?: number | null
          prev_actual_progress?: number | null
          prev_date?: string | null
          prev_planned_progress?: number | null
          snapshot_date: string
          source_file?: string | null
          updated_at?: string
        }
        Update: {
          activity?: string | null
          actual_delta?: number | null
          actual_progress?: number | null
          discipline?: string
          id?: number
          item_key?: string
          plan_delta?: number | null
          planned_progress?: number | null
          prev_actual_progress?: number | null
          prev_date?: string | null
          prev_planned_progress?: number | null
          snapshot_date?: string
          source_file?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      activity_snapshots: {
        Row: {
          activity: string | null
          activity_no: string | null
          actual_progress: number | null
          baseline_date: string | null
          batch_id: number | null
          building: string | null
          captured_at: string
          discipline: string
          done_quantity: number | null
          finish_date: string | null
          id: number
          item_key: string
          manager: string | null
          milestone: string | null
          planned_progress: number | null
          room: string | null
          snapshot_date: string
          source_file: string | null
          start_date: string | null
          subcontractor: string | null
          total_quantity: number | null
          unit: string | null
          work_scope: string | null
        }
        Insert: {
          activity?: string | null
          activity_no?: string | null
          actual_progress?: number | null
          baseline_date?: string | null
          batch_id?: number | null
          building?: string | null
          captured_at?: string
          discipline: string
          done_quantity?: number | null
          finish_date?: string | null
          id?: number
          item_key: string
          manager?: string | null
          milestone?: string | null
          planned_progress?: number | null
          room?: string | null
          snapshot_date?: string
          source_file?: string | null
          start_date?: string | null
          subcontractor?: string | null
          total_quantity?: number | null
          unit?: string | null
          work_scope?: string | null
        }
        Update: {
          activity?: string | null
          activity_no?: string | null
          actual_progress?: number | null
          baseline_date?: string | null
          batch_id?: number | null
          building?: string | null
          captured_at?: string
          discipline?: string
          done_quantity?: number | null
          finish_date?: string | null
          id?: number
          item_key?: string
          manager?: string | null
          milestone?: string | null
          planned_progress?: number | null
          room?: string | null
          snapshot_date?: string
          source_file?: string | null
          start_date?: string | null
          subcontractor?: string | null
          total_quantity?: number | null
          unit?: string | null
          work_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      company_disciplines: {
        Row: {
          aliases: string[]
          discipline: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          discipline: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          discipline?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exec_summaries: {
        Row: {
          base: string
          created_by: string | null
          generated_at: string
          summary: string
        }
        Insert: {
          base: string
          created_by?: string | null
          generated_at?: string
          summary: string
        }
        Update: {
          base?: string
          created_by?: string | null
          generated_at?: string
          summary?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          file_date: string | null
          file_name: string
          id: number
          kind: string
          rev: number | null
          row_count: number
          slot: string
        }
        Insert: {
          created_at?: string
          file_date?: string | null
          file_name: string
          id?: number
          kind: string
          rev?: number | null
          row_count?: number
          slot: string
        }
        Update: {
          created_at?: string
          file_date?: string | null
          file_name?: string
          id?: number
          kind?: string
          rev?: number | null
          row_count?: number
          slot?: string
        }
        Relationships: []
      }
      manpower_aliases: {
        Row: {
          alias: string
          canonical: string
          created_at: string
          kind: string
          note: string | null
        }
        Insert: {
          alias: string
          canonical: string
          created_at?: string
          kind: string
          note?: string | null
        }
        Update: {
          alias?: string
          canonical?: string
          created_at?: string
          kind?: string
          note?: string | null
        }
        Relationships: []
      }
      manpower_calendar: {
        Row: {
          day: string
          is_workday: boolean
          note: string | null
        }
        Insert: {
          day: string
          is_workday?: boolean
          note?: string | null
        }
        Update: {
          day?: string
          is_workday?: boolean
          note?: string | null
        }
        Relationships: []
      }
      manpower_companies: {
        Row: {
          active_from: string | null
          active_to: string | null
          contract_no: string | null
          discipline: string | null
          is_active: boolean
          name: string
          short_name: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          contract_no?: string | null
          discipline?: string | null
          is_active?: boolean
          name: string
          short_name?: string | null
          sort_order: number
          updated_at?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          contract_no?: string | null
          discipline?: string | null
          is_active?: boolean
          name?: string
          short_name?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      manpower_entries: {
        Row: {
          client_submitted_at: string | null
          client_tz_offset_min: number | null
          company: string
          electrician: number
          id: number
          location: string
          operator: number
          plumber: number
          report_date: string
          report_time: string | null
          reporter_name: string | null
          reporter_tg_id: string | null
          safety_officer: number
          scaffolder: number
          sheet_row: number
          shift: string
          source: Database["public"]["Enums"]["manpower_source"]
          staff: number
          status: string
          submission_id: string
          submitted_at: string | null
          subtotal: number
          synced_at: string
          worker: number
        }
        Insert: {
          client_submitted_at?: string | null
          client_tz_offset_min?: number | null
          company: string
          electrician?: number
          id?: number
          location: string
          operator?: number
          plumber?: number
          report_date: string
          report_time?: string | null
          reporter_name?: string | null
          reporter_tg_id?: string | null
          safety_officer?: number
          scaffolder?: number
          sheet_row: number
          shift: string
          source: Database["public"]["Enums"]["manpower_source"]
          staff?: number
          status: string
          submission_id: string
          submitted_at?: string | null
          subtotal?: number
          synced_at?: string
          worker?: number
        }
        Update: {
          client_submitted_at?: string | null
          client_tz_offset_min?: number | null
          company?: string
          electrician?: number
          id?: number
          location?: string
          operator?: number
          plumber?: number
          report_date?: string
          report_time?: string | null
          reporter_name?: string | null
          reporter_tg_id?: string | null
          safety_officer?: number
          scaffolder?: number
          sheet_row?: number
          shift?: string
          source?: Database["public"]["Enums"]["manpower_source"]
          staff?: number
          status?: string
          submission_id?: string
          submitted_at?: string | null
          subtotal?: number
          synced_at?: string
          worker?: number
        }
        Relationships: []
      }
      manpower_ingest_log: {
        Row: {
          error: string | null
          id: number
          mode: string
          ok: boolean
          received_at: string
          rows_in: number
          rows_upserted: number
          warnings: Json | null
        }
        Insert: {
          error?: string | null
          id?: number
          mode: string
          ok?: boolean
          received_at?: string
          rows_in?: number
          rows_upserted?: number
          warnings?: Json | null
        }
        Update: {
          error?: string | null
          id?: number
          mode?: string
          ok?: boolean
          received_at?: string
          rows_in?: number
          rows_upserted?: number
          warnings?: Json | null
        }
        Relationships: []
      }
      manpower_locations: {
        Row: {
          bldg_code: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          zone: string | null
        }
        Insert: {
          bldg_code?: string | null
          is_active?: boolean
          name: string
          sort_order: number
          updated_at?: string
          zone?: string | null
        }
        Update: {
          bldg_code?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          zone?: string | null
        }
        Relationships: []
      }
      manpower_members: {
        Row: {
          company: string | null
          created_at: string
          is_active: boolean
          name: string
          note: string | null
          role: string
          telegram_id: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          is_active?: boolean
          name: string
          note?: string | null
          role?: string
          telegram_id: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          is_active?: boolean
          name?: string
          note?: string | null
          role?: string
          telegram_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      manpower_plan: {
        Row: {
          company: string
          created_at: string
          granularity: string
          id: number
          plan_date: string
          planned_by_trade: Json | null
          planned_total: number
          rev: string | null
          source_file: string | null
        }
        Insert: {
          company: string
          created_at?: string
          granularity?: string
          id?: number
          plan_date: string
          planned_by_trade?: Json | null
          planned_total: number
          rev?: string | null
          source_file?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          granularity?: string
          id?: number
          plan_date?: string
          planned_by_trade?: Json | null
          planned_total?: number
          rev?: string | null
          source_file?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          must_change_password: boolean
          position: string | null
          team: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          must_change_password?: boolean
          position?: string | null
          team?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          position?: string | null
          team?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      safety_reports: {
        Row: {
          created_by: string | null
          day: string
          generated_at: string
          generated_at_en: string | null
          pdf_en_path: string | null
          pdf_ko_path: string | null
          risks: Json
          risks_en: Json | null
          telegram_ready_at: string | null
          telegram_send_seq: number
        }
        Insert: {
          created_by?: string | null
          day: string
          generated_at?: string
          generated_at_en?: string | null
          pdf_en_path?: string | null
          pdf_ko_path?: string | null
          risks?: Json
          risks_en?: Json | null
          telegram_ready_at?: string | null
          telegram_send_seq?: number
        }
        Update: {
          created_by?: string | null
          day?: string
          generated_at?: string
          generated_at_en?: string | null
          pdf_en_path?: string | null
          pdf_ko_path?: string | null
          risks?: Json
          risks_en?: Json | null
          telegram_ready_at?: string | null
          telegram_send_seq?: number
        }
        Relationships: []
      }
      tc_daily_progress: {
        Row: {
          actual_count: number
          actual_qty: number
          bldg: string | null
          discipline: string
          equip: string | null
          event_date: string
          file_date: string | null
          grp: string | null
          id: number
          item: string | null
          item_key: string
          plan_count: number
          plan_qty: number
          qty: number
          source_file: string | null
          stage: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          actual_count?: number
          actual_qty?: number
          bldg?: string | null
          discipline: string
          equip?: string | null
          event_date: string
          file_date?: string | null
          grp?: string | null
          id?: number
          item?: string | null
          item_key: string
          plan_count?: number
          plan_qty?: number
          qty?: number
          source_file?: string | null
          stage: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          actual_count?: number
          actual_qty?: number
          bldg?: string | null
          discipline?: string
          equip?: string | null
          event_date?: string
          file_date?: string | null
          grp?: string | null
          id?: number
          item?: string | null
          item_key?: string
          plan_count?: number
          plan_qty?: number
          qty?: number
          source_file?: string | null
          stage?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tc_items: {
        Row: {
          bldg: string | null
          bldg_raw: string | null
          created_at: string
          discipline: string
          docref: string | null
          equip: string | null
          file_date: string | null
          grp: string | null
          id: number
          item: string | null
          qty: number
          resp_a: string | null
          resp_p: string | null
          rfi_a: string | null
          rfi_d: number | null
          rfi_p: string | null
          rfi_rem: number | null
          row_no: number | null
          rp_a: string | null
          rp_d: number | null
          rp_p: string | null
          rp_rem: number | null
          source_file: string | null
          status: string | null
          supplier: string | null
          t0_a: string | null
          t0_d: number | null
          t0_p: string | null
          t0_rem: number | null
          t1_a: string | null
          t1_d: number | null
          t1_p: string | null
          t1_rem: number | null
          t2_a: string | null
          t2_p: string | null
        }
        Insert: {
          bldg?: string | null
          bldg_raw?: string | null
          created_at?: string
          discipline: string
          docref?: string | null
          equip?: string | null
          file_date?: string | null
          grp?: string | null
          id?: number
          item?: string | null
          qty?: number
          resp_a?: string | null
          resp_p?: string | null
          rfi_a?: string | null
          rfi_d?: number | null
          rfi_p?: string | null
          rfi_rem?: number | null
          row_no?: number | null
          rp_a?: string | null
          rp_d?: number | null
          rp_p?: string | null
          rp_rem?: number | null
          source_file?: string | null
          status?: string | null
          supplier?: string | null
          t0_a?: string | null
          t0_d?: number | null
          t0_p?: string | null
          t0_rem?: number | null
          t1_a?: string | null
          t1_d?: number | null
          t1_p?: string | null
          t1_rem?: number | null
          t2_a?: string | null
          t2_p?: string | null
        }
        Update: {
          bldg?: string | null
          bldg_raw?: string | null
          created_at?: string
          discipline?: string
          docref?: string | null
          equip?: string | null
          file_date?: string | null
          grp?: string | null
          id?: number
          item?: string | null
          qty?: number
          resp_a?: string | null
          resp_p?: string | null
          rfi_a?: string | null
          rfi_d?: number | null
          rfi_p?: string | null
          rfi_rem?: number | null
          row_no?: number | null
          rp_a?: string | null
          rp_d?: number | null
          rp_p?: string | null
          rp_rem?: number | null
          source_file?: string | null
          status?: string | null
          supplier?: string | null
          t0_a?: string | null
          t0_d?: number | null
          t0_p?: string | null
          t0_rem?: number | null
          t1_a?: string | null
          t1_d?: number | null
          t1_p?: string | null
          t1_rem?: number | null
          t2_a?: string | null
          t2_p?: string | null
        }
        Relationships: []
      }
      tc_manual: {
        Row: {
          block: string
          discipline: string
          id: number
          item_key: string
          memo: string | null
          updated_at: string
        }
        Insert: {
          block: string
          discipline: string
          id?: number
          item_key: string
          memo?: string | null
          updated_at?: string
        }
        Update: {
          block?: string
          discipline?: string
          id?: number
          item_key?: string
          memo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tc_snapshots: {
        Row: {
          batch_id: number | null
          bldg: string | null
          captured_at: string
          discipline: string
          docref: string | null
          equip: string | null
          file_date: string | null
          grp: string | null
          id: number
          item: string | null
          item_key: string
          qty: number
          resp_a: string | null
          resp_p: string | null
          rfi_a: string | null
          rfi_d: number | null
          rfi_p: string | null
          rfi_rem: number | null
          rp_a: string | null
          rp_d: number | null
          rp_p: string | null
          rp_rem: number | null
          snapshot_date: string
          status: string | null
          supplier: string | null
          t0_a: string | null
          t0_d: number | null
          t0_p: string | null
          t0_rem: number | null
          t1_a: string | null
          t1_d: number | null
          t1_p: string | null
          t1_rem: number | null
          t2_a: string | null
          t2_p: string | null
        }
        Insert: {
          batch_id?: number | null
          bldg?: string | null
          captured_at?: string
          discipline: string
          docref?: string | null
          equip?: string | null
          file_date?: string | null
          grp?: string | null
          id?: number
          item?: string | null
          item_key: string
          qty?: number
          resp_a?: string | null
          resp_p?: string | null
          rfi_a?: string | null
          rfi_d?: number | null
          rfi_p?: string | null
          rfi_rem?: number | null
          rp_a?: string | null
          rp_d?: number | null
          rp_p?: string | null
          rp_rem?: number | null
          snapshot_date?: string
          status?: string | null
          supplier?: string | null
          t0_a?: string | null
          t0_d?: number | null
          t0_p?: string | null
          t0_rem?: number | null
          t1_a?: string | null
          t1_d?: number | null
          t1_p?: string | null
          t1_rem?: number | null
          t2_a?: string | null
          t2_p?: string | null
        }
        Update: {
          batch_id?: number | null
          bldg?: string | null
          captured_at?: string
          discipline?: string
          docref?: string | null
          equip?: string | null
          file_date?: string | null
          grp?: string | null
          id?: number
          item?: string | null
          item_key?: string
          qty?: number
          resp_a?: string | null
          resp_p?: string | null
          rfi_a?: string | null
          rfi_d?: number | null
          rfi_p?: string | null
          rfi_rem?: number | null
          rp_a?: string | null
          rp_d?: number | null
          rp_p?: string | null
          rp_rem?: number | null
          snapshot_date?: string
          status?: string | null
          supplier?: string | null
          t0_a?: string | null
          t0_d?: number | null
          t0_p?: string | null
          t0_rem?: number | null
          t1_a?: string | null
          t1_d?: number | null
          t1_p?: string | null
          t1_rem?: number | null
          t2_a?: string | null
          t2_p?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tc_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_scopes: {
        Row: {
          created_at: string
          id: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_manpower_cards: {
        Row: {
          company: string | null
          electrician: number | null
          location: string | null
          n_rows: number | null
          operator: number | null
          plumber: number | null
          report_date: string | null
          reporter_name: string | null
          safety_officer: number | null
          scaffolder: number | null
          shift: string | null
          source: Database["public"]["Enums"]["manpower_source"] | null
          staff: number | null
          submitted_at: string | null
          subtotal: number | null
          worker: number | null
        }
        Relationships: []
      }
      v_manpower_compare: {
        Row: {
          company: string | null
          diff: number | null
          hdec_counter: string | null
          location: string | null
          report_date: string | null
          reported: number | null
          result: string | null
          shift: string | null
          sub_reporter: string | null
          verified: number | null
        }
        Relationships: []
      }
      v_manpower_daily: {
        Row: {
          cards: number | null
          company: string | null
          day_total: number | null
          electrician: number | null
          first_submitted_at: string | null
          night_total: number | null
          operator: number | null
          ot_total: number | null
          plumber: number | null
          report_date: string | null
          safety_officer: number | null
          scaffolder: number | null
          source: Database["public"]["Enums"]["manpower_source"] | null
          staff: number | null
          total: number | null
          worker: number | null
        }
        Relationships: []
      }
      v_safety_telegram: {
        Row: {
          cover_en: string | null
          cover_ko: string | null
          day: string | null
          pdf_en_url: string | null
          pdf_ko_url: string | null
          ready_at: string | null
          send_seq: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activity_daily_trend: {
        Args: { _discipline?: string }
        Returns: {
          actual_avg: number
          item_count: number
          planned_avg: number
          snapshot_date: string
        }[]
      }
      can_edit_slot: {
        Args: { _slot: string; _user_id: string }
        Returns: boolean
      }
      fill_snapshots_backfill: { Args: never; Returns: number }
      fill_snapshots_for_day: { Args: { _date: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      manpower_name_usage: {
        Args: never
        Returns: {
          entry_count: number
          kind: string
          name: string
        }[]
      }
      refresh_activity_daily: { Args: { _date: string }; Returns: number }
      refresh_activity_daily_all: { Args: never; Returns: number }
      refresh_tc_daily: { Args: { _discipline?: string }; Returns: number }
      slot_scope: { Args: { _slot: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user" | "guest"
      manpower_source: "SUB" | "HDEC"
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
      app_role: ["admin", "user", "guest"],
      manpower_source: ["SUB", "HDEC"],
    },
  },
} as const
