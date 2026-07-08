# פריסה ל-Render — צפייה ביוטיוב / כתוביות

מדריך קצר להעלאת **מסך הכלים** (פלייליסט, נגן, כתוביות) אונליין.
בשלב זה **אין צורך** במפתחות Schooler או רב מסר.

## מה נדרש

1. חשבון [Render](https://render.com) (מומלץ Login עם GitHub)
2. ריפו GitHub עם הקוד (פרטי מומלץ)
3. מפתח [Supadata](https://supadata.ai) לכתוביות בענן (`SUPADATA_API_KEY`)

## צעדים ב-Render

1. **New → Web Service** → בחר את הריפו.
2. הגדרות:
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm run start:prod`
   - **Instance:** Starter (מומלץ Always-on; Free עלול לישון)
3. **Environment Variables:**

| מפתח | ערך |
|------|-----|
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGIN` | `https://schooler-z7x3.onrender.com` |
| `SUPADATA_API_KEY` | המפתח מ-Supadata |
| `SUPADATA_FIRST` | `true` |
| `USE_PUBPROXY` | `false` |

4. Deploy.

אחרי שהשירות עלה — עדכן את `FRONTEND_ORIGIN` לכתובת האמיתית ולחץ **Manual Deploy** אם צריך.

## בדיקה

1. פתח את כתובת Render.
2. הדבק קישור פלייליסט יוטיוב → חלץ.
3. נגן פרק + הורד כתוביות.

## הערה

יש גם `render.yaml` בפרויקט — אפשר לייבא Blueprint מ-Render אם מעדיפים הגדרה מקובץ.
