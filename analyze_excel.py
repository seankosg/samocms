import pandas as pd
import numpy as np
import os

files = [
    "/mnt/user-uploads/SAMO_통합공정표_202609_05_rev.1_Arch.xlsx",
    "/mnt/user-uploads/SAMO_통합공정표_202609_05_rev.1_Elec.xlsx",
    "/mnt/user-uploads/SAMO_통합공정표_202609_05_rev.1_Int.xlsx",
    "/mnt/user-uploads/SAMO_통합공정표_202609_05_rev.1_Mech.xlsx",
    "/mnt/user-uploads/SAMO_통합공정표_202609_05_rev.1_Permit.xlsx"
]

def excel_date_to_dt(serial):
    try:
        if pd.isna(serial) or not isinstance(serial, (int, float)):
            return pd.NaT
        return pd.to_datetime(serial, unit='D', origin='1899-12-30')
    except:
        return pd.NaT

results = []

for f in files:
    filename = os.path.basename(f)
    try:
        # Read all columns, skip 5 rows (indices 0-4)
        df = pd.read_excel(f, header=None, skiprows=5)
        
        # Column Indices (based on inspection):
        # 1: 공종 (Dept), 7: Activity, 12: 계획(%), 13: 실적(%), 16: Start, 17: Finish
        
        total_rows = len(df)
        
        # 공종별 건수 (Col 1)
        work_types = df[1].value_counts().to_dict()
        
        # Null check (Important columns: Activity(7), Start(16), Finish(17))
        null_counts = {
            "Activity": df[7].isna().sum(),
            "Start": df[16].isna().sum(),
            "Finish": df[17].isna().sum(),
            "Plan": df[12].isna().sum(),
            "Actual": df[13].isna().sum()
        }
        
        # Dates
        starts = df[16].apply(excel_date_to_dt)
        finishes = df[17].apply(excel_date_to_dt)
        date_min = starts.min()
        date_max = finishes.max()
        
        # Plan/Actual ranges
        plan_vals = pd.to_numeric(df[12], errors='coerce')
        act_vals = pd.to_numeric(df[13], errors='coerce')
        
        plan_range = (plan_vals.min(), plan_vals.max())
        act_range = (act_vals.min(), act_vals.max())
        
        # Outliers (e.g., plan/actual > 1 or < 0 if they are ratios, or > 100 if percentages)
        # Based on the sample, "계획(%)" has values like 1, 0. Maybe they are ratios (0 to 1).
        # Let's check the distribution.
        
        results.append({
            "filename": filename,
            "total_rows": total_rows,
            "work_types": work_types,
            "null_counts": null_counts,
            "date_range": (date_min, date_max),
            "plan_range": plan_range,
            "act_range": act_range
        })
    except Exception as e:
        results.append({"filename": filename, "error": str(e)})

for res in results:
    print(f"File: {res['filename']}")
    if "error" in res:
        print(f"  Error: {res['error']}")
        continue
    print(f"  Total Rows: {res['total_rows']}")
    print(f"  Work Types: {res['work_types']}")
    print(f"  Null Counts: {res['null_counts']}")
    print(f"  Date Range: {res['date_range'][0]} to {res['date_range'][1]}")
    print(f"  Plan Range: {res['plan_range']}")
    print(f"  Actual Range: {res['act_range']}")
    print("-" * 30)

