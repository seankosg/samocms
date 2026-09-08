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
      [_ in never]: never
    }
    Functions: {
      can_edit_slot: {
        Args: { _slot: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_activity_daily: { Args: { _date: string }; Returns: number }
      refresh_activity_daily_all: { Args: never; Returns: number }
      refresh_tc_daily: { Args: { _discipline?: string }; Returns: number }
      slot_scope: { Args: { _slot: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user" | "guest"
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
    },
  },
} as const
