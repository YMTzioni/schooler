/** פעולות Schooler API — https://app.swaggerhub.com/apis/Responder/SchoolerAPI/1.0.0 */

export const SCHOOLER_OPERATION_GROUPS = [
  {
    id: 'courses',
    label: 'קורסים',
    ops: [
      {
        id: 'courses-list',
        label: 'רשימת קורסים',
        method: 'GET',
        path: '/api/v1/courses',
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '50' },
        ],
      },
      {
        id: 'courses-get',
        label: 'פרטי קורס',
        method: 'GET',
        path: '/api/v1/courses/{id}',
        pathFields: [{ name: 'id', label: 'מזהה קורס', required: true }],
      },
      {
        id: 'courses-lessons',
        label: 'שיעורי קורס',
        method: 'GET',
        path: '/api/v1/courses/{course_id}/lessons',
        pathFields: [{ name: 'course_id', label: 'מזהה קורס', required: true }],
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '100' },
        ],
      },
      {
        id: 'courses-students',
        label: 'סטודנטים בקורס',
        method: 'GET',
        path: '/api/v1/courses/{course_id}/students',
        pathFields: [{ name: 'course_id', label: 'מזהה קורס', required: true }],
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '50' },
        ],
      },
      {
        id: 'courses-enroll',
        label: 'הוספת סטודנטים לקורס',
        method: 'POST',
        path: '/api/v1/courses/{course_id}/enroll_students',
        pathFields: [{ name: 'course_id', label: 'מזהה קורס', required: true }],
        bodyTemplate: {
          students: [
            {
              name: 'שם תלמיד',
              email: 'student@example.com',
              student_phone: '0500000000',
              password: '',
              send_welcome_email_school: false,
            },
          ],
        },
      },
      {
        id: 'courses-update-students',
        label: 'עדכון סטודנטים בקורס',
        method: 'PUT',
        path: '/api/v1/courses/{course_id}/update_students',
        pathFields: [{ name: 'course_id', label: 'מזהה קורס', required: true }],
        bodyTemplate: {
          students: [{ student_id: 0, name: 'שם מעודכן', email: 'updated@example.com' }],
        },
      },
      {
        id: 'courses-delete-students',
        label: 'הסרת סטודנטים מקורס',
        method: 'POST',
        path: '/api/v1/courses/{course_id}/delete_students',
        pathFields: [{ name: 'course_id', label: 'מזהה קורס', required: true }],
        bodyTemplate: { student_ids: [0] },
      },
    ],
  },
  {
    id: 'schools',
    label: 'בתי ספר',
    ops: [
      {
        id: 'schools-list',
        label: 'רשימת בתי ספר',
        method: 'GET',
        path: '/api/v1/schools',
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '50' },
        ],
      },
      {
        id: 'schools-get',
        label: 'פרטי בית ספר',
        method: 'GET',
        path: '/api/v1/schools/{id}',
        pathFields: [{ name: 'id', label: 'מזהה בית ספר', required: true }],
      },
      {
        id: 'schools-students',
        label: 'סטודנטים בבית ספר',
        method: 'GET',
        path: '/api/v1/schools/{school_id}/students',
        pathFields: [{ name: 'school_id', label: 'מזהה בית ספר', required: true }],
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '50' },
        ],
      },
      {
        id: 'schools-enroll',
        label: 'הוספת סטודנטים לבית ספר',
        method: 'POST',
        path: '/api/v1/schools/{school_id}/enroll_students',
        pathFields: [{ name: 'school_id', label: 'מזהה בית ספר', required: true }],
        bodyFields: [
          {
            path: 'students_data[0].name',
            label: 'שם מלא',
            type: 'text',
            required: true,
            placeholder: 'ישראל ישראלי',
            defaultValue: '',
          },
          {
            path: 'students_data[0].email',
            label: 'אימייל',
            type: 'email',
            required: true,
            placeholder: 'student@example.com',
            defaultValue: '',
          },
          {
            path: 'students_data[0].student_phone',
            label: 'טלפון',
            type: 'phone',
            placeholder: '0500000000',
            defaultValue: '',
          },
          {
            path: 'students_data[0].course_ids',
            label: 'מזהי קורסים (JSON Array)',
            type: 'json',
            placeholder: '[123,456]',
            defaultValue: [0],
          },
        ],
        bodyTemplate: {
          students_data: [
            {
              name: 'שם תלמיד',
              email: 'student@example.com',
              student_phone: '0500000000',
              course_ids: [0],
            },
          ],
        },
      },
      {
        id: 'schools-update-students',
        label: 'עדכון סטודנטים בבית ספר',
        method: 'PUT',
        path: '/api/v1/schools/{school_id}/update_students',
        pathFields: [{ name: 'school_id', label: 'מזהה בית ספר', required: true }],
        bodyTemplate: {
          students: [{ student_id: 0, name: 'שם מעודכן' }],
        },
      },
      {
        id: 'schools-delete-students',
        label: 'הסרת סטודנטים מבית ספר',
        method: 'POST',
        path: '/api/v1/schools/{school_id}/delete_students',
        pathFields: [{ name: 'school_id', label: 'מזהה בית ספר', required: true }],
        bodyTemplate: { student_ids: [0] },
      },
    ],
  },
  {
    id: 'students',
    label: 'סטודנטים',
    ops: [
      {
        id: 'students-search',
        label: 'חיפוש סטודנט',
        method: 'GET',
        path: '/api/v1/students/search',
        queryFields: [
          { name: 'email', label: 'אימייל' },
          { name: 'id', label: 'מזהה' },
          { name: 'phone', label: 'טלפון' },
        ],
      },
      {
        id: 'students-unique-link',
        label: 'קישור אישי לסטודנט',
        method: 'GET',
        path: '/api/v1/students/{student_id}/unique_link',
        pathFields: [{ name: 'student_id', label: 'מזהה סטודנט', required: true }],
        queryFields: [
          { name: 'course_id', label: 'מזהה קורס (אופציונלי)' },
          { name: 'school_id', label: 'מזהה בית ספר (אופציונלי)' },
        ],
      },
      {
        id: 'students-reset-ip',
        label: 'איפוס הגבלת IP',
        method: 'POST',
        path: '/api/v1/students/reset_ip',
        bodyTemplate: { student_ids: [0] },
      },
      {
        id: 'students-resend-access',
        label: 'שליחת פרטי גישה מחדש',
        method: 'POST',
        path: '/api/v1/students/resend_access',
        bodyTemplate: { student_ids: [0] },
      },
      {
        id: 'students-activate-school',
        label: 'הפעלה בבית ספר',
        method: 'POST',
        path: '/api/v1/students/{student_id}/activate_in_school',
        pathFields: [{ name: 'student_id', label: 'מזהה סטודנט', required: true }],
        bodyTemplate: { school_id: 0, course_ids: [0] },
      },
      {
        id: 'students-activate-course',
        label: 'הפעלה בקורס',
        method: 'POST',
        path: '/api/v1/students/{student_id}/activate_in_course',
        pathFields: [{ name: 'student_id', label: 'מזהה סטודנט', required: true }],
        bodyTemplate: { course_id: 0 },
      },
      {
        id: 'students-inactivate-school',
        label: 'השבתה בבית ספר',
        method: 'POST',
        path: '/api/v1/students/{student_id}/inactivate_in_school',
        pathFields: [{ name: 'student_id', label: 'מזהה סטודנט', required: true }],
        bodyTemplate: { school_id: 0, course_ids: [0] },
      },
      {
        id: 'students-inactivate-course',
        label: 'השבתה בקורס',
        method: 'POST',
        path: '/api/v1/students/{student_id}/inactivate_in_course',
        pathFields: [{ name: 'student_id', label: 'מזהה סטודנט', required: true }],
        bodyTemplate: { course_id: 0 },
      },
    ],
  },
  {
    id: 'advanced',
    label: 'מתקדם',
    ops: [
      {
        id: 'proxy-custom',
        label: 'בקשה מותאמת (Proxy)',
        method: 'POST',
        path: '/api/v1/courses',
        customProxy: true,
        bodyTemplate: {},
      },
    ],
  },
]
