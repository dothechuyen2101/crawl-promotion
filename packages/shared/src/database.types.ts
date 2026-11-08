
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"api_keys": {
                  Row: {
                    "created_at": string,"id": number,"key_hash": string,"last_used_at": string | null,"name": string,"revoked": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"key_hash": string,"last_used_at"?: string | null,"name": string,"revoked"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"key_hash"?: string,"last_used_at"?: string | null,"name"?: string,"revoked"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"clicks": {
                  Row: {
                    "created_at": string,"id": number,"platform": Database["public"]['Enums']["platform"] | null,"promotion_id": string | null,"referrer": string | null,"search_result_id": number | null,"target_url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"platform"?: Database["public"]['Enums']["platform"] | null,"promotion_id"?: string | null,"referrer"?: string | null,"search_result_id"?: number | null,"target_url": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"platform"?: Database["public"]['Enums']["platform"] | null,"promotion_id"?: string | null,"referrer"?: string | null,"search_result_id"?: number | null,"target_url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clicks_promotion_id_fkey"
      columns: ["promotion_id"]
isOneToOne: false
      referencedRelation: "promotions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clicks_search_result_id_fkey"
      columns: ["search_result_id"]
isOneToOne: false
      referencedRelation: "search_results"
      referencedColumns: ["id"]
    }
                  ]
                },"crawl_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"found": number,"id": number,"inserted": number,"invalid": number,"source_id": string,"started_at": string,"status": Database["public"]['Enums']["run_status"],"updated": number
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"found"?: number,"id"?: never,"inserted"?: number,"invalid"?: number,"source_id": string,"started_at"?: string,"status"?: Database["public"]['Enums']["run_status"],"updated"?: number
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"found"?: number,"id"?: never,"inserted"?: number,"invalid"?: number,"source_id"?: string,"started_at"?: string,"status"?: Database["public"]['Enums']["run_status"],"updated"?: number
                  }
                  Relationships: [
                    
                  ]
                },"notification_log": {
                  Row: {
                    "chat_id": number,"promotion_id": string,"sent_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chat_id": number,"promotion_id": string,"sent_at"?: string
                  }
                  Update: {
                    "chat_id"?: number,"promotion_id"?: string,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_log_promotion_id_fkey"
      columns: ["promotion_id"]
isOneToOne: false
      referencedRelation: "promotions"
      referencedColumns: ["id"]
    }
                  ]
                },"price_history": {
                  Row: {
                    "captured_at": string,"id": number,"original_price": number | null,"price": number,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "captured_at"?: string,"id"?: never,"original_price"?: number | null,"price": number,"product_id": string
                  }
                  Update: {
                    "captured_at"?: string,"id"?: never,"original_price"?: number | null,"price"?: number,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_history_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category": string | null,"category_slug": string | null,"current_price": number | null,"external_id": string,"first_seen_at": string,"id": string,"image_url": string | null,"last_seen_at": string,"original_price": number | null,"platform": Database["public"]['Enums']["platform"],"search_text": string,"shop_id": string | null,"shop_name": string | null,"title": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"category_slug"?: string | null,"current_price"?: number | null,"external_id": string,"first_seen_at"?: string,"id"?: string,"image_url"?: string | null,"last_seen_at"?: string,"original_price"?: number | null,"platform": Database["public"]['Enums']["platform"],"search_text"?: string,"shop_id"?: string | null,"shop_name"?: string | null,"title": string,"url": string
                  }
                  Update: {
                    "category"?: string | null,"category_slug"?: string | null,"current_price"?: number | null,"external_id"?: string,"first_seen_at"?: string,"id"?: string,"image_url"?: string | null,"last_seen_at"?: string,"original_price"?: number | null,"platform"?: Database["public"]['Enums']["platform"],"search_text"?: string,"shop_id"?: string | null,"shop_name"?: string | null,"title"?: string,"url"?: string
                  }
                  Relationships: [
                    
                  ]
                },"promotions": {
                  Row: {
                    "affiliate_url": string | null,"applicable_categories": (string)[],"category": string | null,"category_slug": string | null,"city": string | null,"code": string | null,"conditions": NonNullable<Json>,"content_hash": string,"deal_quality": string | null,"description": string | null,"discount_pct": number | null,"discount_type": Database["public"]['Enums']["discount_type"] | null,"discount_value": number | null,"end_at": string | null,"external_id": string,"first_seen_at": string,"id": string,"image_url": string | null,"is_cashback": boolean,"is_lowest_30d": boolean,"last_seen_at": string,"max_discount": number | null,"min_spend": number | null,"new_user_only": boolean,"notified_at": string | null,"original_price": number | null,"payment_method": string | null,"platform": Database["public"]['Enums']["platform"],"price_median_30d": number | null,"price_min_30d": number | null,"product_external_id": string | null,"raw": Json | null,"requires_collect": boolean,"sale_price": number | null,"scope": Database["public"]['Enums']["voucher_scope"] | null,"search_text": string,"shop_id": string | null,"shop_name": string | null,"source": string,"stack_group": string | null,"start_at": string | null,"status": Database["public"]['Enums']["promo_status"],"title": string,"type": Database["public"]['Enums']["promo_type"],"updated_at": string,"url": string,"usage_left_pct": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "affiliate_url"?: string | null,"applicable_categories"?: (string)[],"category"?: string | null,"category_slug"?: string | null,"city"?: string | null,"code"?: string | null,"conditions"?: NonNullable<Json>,"content_hash": string,"deal_quality"?: string | null,"description"?: string | null,"discount_pct"?: never,"discount_type"?: Database["public"]['Enums']["discount_type"] | null,"discount_value"?: number | null,"end_at"?: string | null,"external_id": string,"first_seen_at"?: string,"id"?: string,"image_url"?: string | null,"is_cashback"?: boolean,"is_lowest_30d"?: boolean,"last_seen_at"?: string,"max_discount"?: number | null,"min_spend"?: number | null,"new_user_only"?: boolean,"notified_at"?: string | null,"original_price"?: number | null,"payment_method"?: string | null,"platform": Database["public"]['Enums']["platform"],"price_median_30d"?: number | null,"price_min_30d"?: number | null,"product_external_id"?: string | null,"raw"?: Json | null,"requires_collect"?: boolean,"sale_price"?: number | null,"scope"?: Database["public"]['Enums']["voucher_scope"] | null,"search_text"?: string,"shop_id"?: string | null,"shop_name"?: string | null,"source": string,"stack_group"?: string | null,"start_at"?: string | null,"status"?: Database["public"]['Enums']["promo_status"],"title": string,"type": Database["public"]['Enums']["promo_type"],"updated_at"?: string,"url": string,"usage_left_pct"?: number | null
                  }
                  Update: {
                    "affiliate_url"?: string | null,"applicable_categories"?: (string)[],"category"?: string | null,"category_slug"?: string | null,"city"?: string | null,"code"?: string | null,"conditions"?: NonNullable<Json>,"content_hash"?: string,"deal_quality"?: string | null,"description"?: string | null,"discount_pct"?: never,"discount_type"?: Database["public"]['Enums']["discount_type"] | null,"discount_value"?: number | null,"end_at"?: string | null,"external_id"?: string,"first_seen_at"?: string,"id"?: string,"image_url"?: string | null,"is_cashback"?: boolean,"is_lowest_30d"?: boolean,"last_seen_at"?: string,"max_discount"?: number | null,"min_spend"?: number | null,"new_user_only"?: boolean,"notified_at"?: string | null,"original_price"?: number | null,"payment_method"?: string | null,"platform"?: Database["public"]['Enums']["platform"],"price_median_30d"?: number | null,"price_min_30d"?: number | null,"product_external_id"?: string | null,"raw"?: Json | null,"requires_collect"?: boolean,"sale_price"?: number | null,"scope"?: Database["public"]['Enums']["voucher_scope"] | null,"search_text"?: string,"shop_id"?: string | null,"shop_name"?: string | null,"source"?: string,"stack_group"?: string | null,"start_at"?: string | null,"status"?: Database["public"]['Enums']["promo_status"],"title"?: string,"type"?: Database["public"]['Enums']["promo_type"],"updated_at"?: string,"url"?: string,"usage_left_pct"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "bucket": string,"count": number,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"count"?: number,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"search_requests": {
                  Row: {
                    "cache_key": string,"created_at": string,"district": string | null,"error": string | null,"finished_at": string | null,"id": string,"input_url": string | null,"kind": Database["public"]['Enums']["search_kind"],"notify_chat_id": number | null,"platforms_done": (Database["public"]['Enums']["platform"])[],"query": string,"started_at": string | null,"status": Database["public"]['Enums']["search_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_key": string,"created_at"?: string,"district"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input_url"?: string | null,"kind"?: Database["public"]['Enums']["search_kind"],"notify_chat_id"?: number | null,"platforms_done"?: (Database["public"]['Enums']["platform"])[],"query": string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["search_status"]
                  }
                  Update: {
                    "cache_key"?: string,"created_at"?: string,"district"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input_url"?: string | null,"kind"?: Database["public"]['Enums']["search_kind"],"notify_chat_id"?: number | null,"platforms_done"?: (Database["public"]['Enums']["platform"])[],"query"?: string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["search_status"]
                  }
                  Relationships: [
                    
                  ]
                },"search_results": {
                  Row: {
                    "best_combo": NonNullable<Json>,"category": string | null,"computed_at": string,"final_price": number,"id": number,"image_url": string | null,"is_outlier": boolean,"listing_id": string,"match_score": number,"original_price": number | null,"platform": Database["public"]['Enums']["platform"],"price": number,"request_id": string,"shipping_fee": number | null,"shop_id": string | null,"shop_name": string | null,"title": string,"url": string,"vouchers": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "best_combo"?: NonNullable<Json>,"category"?: string | null,"computed_at"?: string,"final_price": number,"id"?: never,"image_url"?: string | null,"is_outlier"?: boolean,"listing_id": string,"match_score"?: number,"original_price"?: number | null,"platform": Database["public"]['Enums']["platform"],"price": number,"request_id": string,"shipping_fee"?: number | null,"shop_id"?: string | null,"shop_name"?: string | null,"title": string,"url": string,"vouchers"?: NonNullable<Json>
                  }
                  Update: {
                    "best_combo"?: NonNullable<Json>,"category"?: string | null,"computed_at"?: string,"final_price"?: number,"id"?: never,"image_url"?: string | null,"is_outlier"?: boolean,"listing_id"?: string,"match_score"?: number,"original_price"?: number | null,"platform"?: Database["public"]['Enums']["platform"],"price"?: number,"request_id"?: string,"shipping_fee"?: number | null,"shop_id"?: string | null,"shop_name"?: string | null,"title"?: string,"url"?: string,"vouchers"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_results_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "search_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_categories": {
                  Row: {
                    "category_slug": string,"model": string | null,"platform": Database["public"]['Enums']["platform"],"samples": number,"share": number,"shop_key": string,"shop_name": string,"source": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_slug": string,"model"?: string | null,"platform": Database["public"]['Enums']["platform"],"samples": number,"share": number,"shop_key": string,"shop_name": string,"source"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category_slug"?: string,"model"?: string | null,"platform"?: Database["public"]['Enums']["platform"],"samples"?: number,"share"?: number,"shop_key"?: string,"shop_name"?: string,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"source_settings": {
                  Row: {
                    "consecutive_failures": number,"enabled": boolean,"last_error": string | null,"last_success_at": string | null,"source_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consecutive_failures"?: number,"enabled"?: boolean,"last_error"?: string | null,"last_success_at"?: string | null,"source_id": string,"updated_at"?: string
                  }
                  Update: {
                    "consecutive_failures"?: number,"enabled"?: boolean,"last_error"?: string | null,"last_success_at"?: string | null,"source_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "active": boolean,"categories": (string)[],"created_at": string,"id": number,"keywords": (string)[],"min_discount_pct": number,"platforms": (Database["public"]['Enums']["platform"])[],"telegram_chat_id": number,"types": (Database["public"]['Enums']["promo_type"])[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"categories"?: (string)[],"created_at"?: string,"id"?: never,"keywords"?: (string)[],"min_discount_pct"?: number,"platforms"?: (Database["public"]['Enums']["platform"])[],"telegram_chat_id": number,"types"?: (Database["public"]['Enums']["promo_type"])[],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"categories"?: (string)[],"created_at"?: string,"id"?: never,"keywords"?: (string)[],"min_discount_pct"?: number,"platforms"?: (Database["public"]['Enums']["platform"])[],"telegram_chat_id"?: number,"types"?: (Database["public"]['Enums']["promo_type"])[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"watch_queries": {
                  Row: {
                    "created_at": string,"enabled": boolean,"id": number,"kind": Database["public"]['Enums']["search_kind"],"platform": Database["public"]['Enums']["platform"] | null,"query": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"id"?: never,"kind"?: Database["public"]['Enums']["search_kind"],"platform"?: Database["public"]['Enums']["platform"] | null,"query": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"id"?: never,"kind"?: Database["public"]['Enums']["search_kind"],"platform"?: Database["public"]['Enums']["platform"] | null,"query"?: string
                  }
                  Relationships: [
                    
                  ]
                },"worker_heartbeat": {
                  Row: {
                    "info": NonNullable<Json>,"last_seen_at": string,"version": string | null,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "info"?: NonNullable<Json>,"last_seen_at"?: string,"version"?: string | null,"worker_id": string
                  }
                  Update: {
                    "info"?: NonNullable<Json>,"last_seen_at"?: string,"version"?: string | null,"worker_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_deal_quality":
{ Args: { "items": Json }; Returns: number
                           },
"category_counts":
{ Args: { "p_platform"?: Database["public"]['Enums']["platform"],"p_type"?: Database["public"]['Enums']["promo_type"] }; Returns: {
              "n": number,"slug": string
            }[]
                           },
"cleanup_transient":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"compact_price_history":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"hit_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"refresh_promotion_status":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           }
          }
          Enums: {
            "discount_type": "percent"|"fixed"|"freeship","platform": "shopee"|"tiktok"|"lazada"|"tiki"|"grabfood"|"be","promo_status": "active"|"expired"|"upcoming","promo_type": "voucher"|"flash_sale"|"deal"|"campaign","run_status": "running"|"success"|"error","search_kind": "product"|"food","search_status": "pending"|"running"|"done"|"partial"|"error","voucher_scope": "platform"|"shop"|"freeship"|"payment"|"category"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "discount_type": ["percent", "fixed", "freeship"],"platform": ["shopee", "tiktok", "lazada", "tiki", "grabfood", "be"],"promo_status": ["active", "expired", "upcoming"],"promo_type": ["voucher", "flash_sale", "deal", "campaign"],"run_status": ["running", "success", "error"],"search_kind": ["product", "food"],"search_status": ["pending", "running", "done", "partial", "error"],"voucher_scope": ["platform", "shop", "freeship", "payment", "category"]
          }
        }
} as const
