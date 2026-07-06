/** פעולות רב מסר API V2 — https://app.swaggerhub.com/apis/Responder/responder/V2.0 */

export const RESPONDER_OPERATION_GROUPS = [
  {
    id: 'account',
    label: 'חשבון',
    ops: [
      {
        id: 'me',
        label: 'פרטי חשבון',
        method: 'GET',
        path: '/me',
      },
    ],
  },
  {
    id: 'lists',
    label: 'רשימות תפוצה',
    ops: [
      {
        id: 'lists-all',
        label: 'כל הרשימות',
        method: 'GET',
        path: '/lists',
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '50' },
        ],
      },
      {
        id: 'lists-get',
        label: 'פרטי רשימה',
        method: 'GET',
        path: '/lists/{listid}',
        pathFields: [{ name: 'listid', label: 'מזהה רשימה', required: true }],
      },
      {
        id: 'lists-subscribers',
        label: 'נמענים ברשימה',
        method: 'GET',
        path: '/lists/{listid}/subscribers',
        pathFields: [{ name: 'listid', label: 'מזהה רשימה', required: true }],
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '100' },
        ],
      },
      {
        id: 'lists-fields',
        label: 'שדות ברשימה',
        method: 'GET',
        path: '/lists/{listid}/fields',
        pathFields: [{ name: 'listid', label: 'מזהה רשימה', required: true }],
      },
      {
        id: 'lists-personal-fields',
        label: 'שדות מותאמים ברשימה',
        method: 'GET',
        path: '/lists/{listid}/personal-fields',
        pathFields: [{ name: 'listid', label: 'מזהה רשימה', required: true }],
      },
    ],
  },
  {
    id: 'subscribers',
    label: 'נמענים',
    ops: [
      {
        id: 'subscribers-all',
        label: 'כל הנמענים',
        method: 'GET',
        path: '/subscribers',
        queryFields: [
          { name: 'page', label: 'עמוד', placeholder: '1' },
          { name: 'per_page', label: 'לעמוד', placeholder: '100' },
        ],
      },
      {
        id: 'subscribers-search',
        label: 'חיפוש נמען',
        method: 'GET',
        path: '/subscribers/search',
        queryFields: [
          { name: 'email', label: 'אימייל' },
          { name: 'phone', label: 'טלפון' },
          { name: 'name', label: 'שם' },
        ],
      },
      {
        id: 'subscribers-get',
        label: 'פרטי נמען',
        method: 'GET',
        path: '/subscribers/{id}',
        pathFields: [{ name: 'id', label: 'מזהה נמען', required: true }],
      },
      {
        id: 'subscribers-by-identifier',
        label: 'נמען לפי מזהה',
        method: 'GET',
        path: '/subscribers/identifier/{identifier}',
        pathFields: [{ name: 'identifier', label: 'אימייל / מזהה', required: true }],
      },
      {
        id: 'subscribers-subscribe',
        label: 'הרשמה לרשימה',
        method: 'POST',
        path: '/req/subscribe',
        bodyTemplate: {
          email: 'subscriber@example.com',
          name: 'שם נמען',
          list_id: 0,
        },
      },
      {
        id: 'subscribers-unsubscribe',
        label: 'הסרה מרשימה',
        method: 'POST',
        path: '/req/unsubscribe',
        bodyTemplate: {
          email: 'subscriber@example.com',
          list_id: 0,
        },
      },
    ],
  },
  {
    id: 'tags',
    label: 'תגיות',
    ops: [
      {
        id: 'tags-list',
        label: 'רשימת תגיות',
        method: 'GET',
        path: '/tag',
      },
      {
        id: 'tags-add',
        label: 'הוספת תגית לנמענים',
        method: 'POST',
        path: '/tags/subscribers',
        bodyTemplate: {
          tag_id: 0,
          subscriber_ids: [0],
        },
      },
    ],
  },
  {
    id: 'fields',
    label: 'שדות',
    ops: [
      {
        id: 'personal-fields',
        label: 'שדות מותאמים (כללי)',
        method: 'GET',
        path: '/personal-fields',
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
        method: 'GET',
        path: '/lists',
        customProxy: true,
        bodyTemplate: {},
      },
    ],
  },
]
