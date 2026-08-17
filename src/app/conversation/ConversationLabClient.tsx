"use client";

import React, { useState } from "react";

export interface ConversationLessonData {
  id: number;
  category: string;
  title: string;
  situation: string;
  difficultyLevel?: string | null;
  dialogues: Array<{
    speaker: string;
    role: string;
    japanese: string;
    furigana: string;
    romaji: string;
    english: string;
    audioUrl?: string;
  }>;
  vocabulary: Array<{ word: string; reading: string; meaning: string }>;
  grammarNotes: string[];
  rolePlayPrompt?: string | null;
  audioUrl?: string | null;
  isCompleted: boolean;
}

// Full Multilingual Explanation Databank for all 7 requested languages (Prompt 11)
const MULTILINGUAL_EXPLANATIONS: Record<
  string, // Language code
  Record<
    string, // Lesson Category (greetings, shopping, restaurant, travel, office, interview, hospital, school, business)
    {
      grammarNotes: string[];
      vocabulary: Array<{ word: string; reading: string; meaning: string }>;
    }
  >
> = {
  en: {
    greetings: {
      grammarNotes: ["Using 「〜と申します」 is a polite, humble copula used during introductions.", "「こちらこそ」 gracefully returns the polite sentiment back to the speaker."],
      vocabulary: [
        { word: "初めまして", reading: "はじめまして", meaning: "Nice to meet you (at first sight)" },
        { word: "申します", reading: "もうします", meaning: "To be called (Humble / Kenjougo)" }
      ]
    },
    shopping: {
      grammarNotes: ["「〜はありますか」 is the standard polite inquiry to check store inventory.", "「すみません」 is used as a polite 'Excuse me' to grab an employee's attention."],
      vocabulary: [
        { word: "お探しですか", reading: "おさがしですか", meaning: "Are you searching for something?" },
        { word: "ありますか", reading: "ありますか", meaning: "Do you have...?" }
      ]
    },
    restaurant: {
      grammarNotes: ["「〜をお願いします」 is used to politely order items or request favors.", "「お伺いします」 is a humble verb meaning to inquire or take orders."],
      vocabulary: [
        { word: "注文", reading: "ちゅうもん", meaning: "Order / Food order" },
        { word: "お伺いします", reading: "おうかがいします", meaning: "To take orders / inquire" }
      ]
    },
    travel: {
      grammarNotes: ["「〜まで」 represents 'as far as / up to [destination]'.", "「〜をください」 is used to politely ask for physical tickets or things."],
      vocabulary: [
        { word: "指定席", reading: "していせき", meaning: "Reserved seat (train/bus)" },
        { word: "切符", reading: "きっぷ", meaning: "Ticket" }
      ]
    },
    office: {
      grammarNotes: ["「でございます」 is the ultra-polite, humble business equivalent of 「です」.", "「いらっしゃいますか」 is the honorific (Keigo) equivalent of 「いますか」."],
      vocabulary: [
        { word: "お電話", reading: "おでんわ", meaning: "Telephone / Phone call" },
        { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "Is [Person] present?" }
      ]
    },
    interview: {
      grammarNotes: ["Structure: 「私の強みは [Verb/Noun Phrase] ことです」 outlines strengths clearly.", "「自己PR」 is the standard term for self-promotion in Japanese interviews."],
      vocabulary: [
        { word: "自己紹介", reading: "じこしょうかい", meaning: "Self-introduction" },
        { word: "強み", reading: "つよみ", meaning: "Core strength / merit" }
      ]
    },
    hospital: {
      grammarNotes: ["「〜が痛い」 describes specific physical aches or sickness.", "「どうされましたか」 is how clinicians ask about symptoms."],
      vocabulary: [
        { word: "症状", reading: "しょうじょう", meaning: "Sickness symptoms" },
        { word: "熱", reading: "ねつ", meaning: "Fever" }
      ]
    },
    school: {
      grammarNotes: ["「〜てもよろしいですか」 represents polite, humble permission seeking.", "「分かりにくい」 means 'difficult to understand'."],
      vocabulary: [
        { word: "文法", reading: "ぶんぽう", meaning: "Grammar rules" },
        { word: "質問", reading: "しつもん", meaning: "Question" }
      ]
    },
    business: {
      grammarNotes: ["「〜をいただき」 is the humble Kenjougo form of receiving time or favors.", "「貴重な」 means valuable or precious."],
      vocabulary: [
        { word: "本日は", reading: "ほんじつは", meaning: "Today (Polite/Business)" },
        { word: "貴重な", reading: "きちょうな", meaning: "Precious / valuable" }
      ]
    }
  },
  ta: {
    greetings: {
      grammarNotes: ["அறிமுகங்களின் போது 「〜と申します」 என்பது மரியாதையான, தாழ்மையான சொல்லாகும்.", "「こちらこそ」 என்பது அதே மரியாதையான உணர்வை மீண்டும் வழங்குவதாகும்."],
      vocabulary: [
        { word: "初めまして", reading: "はじめまして", meaning: "உங்களைச் சந்திப்பதில் மகிழ்ச்சி" },
        { word: "申します", reading: "もうします", meaning: "என்று அழைக்கப்படுகிறேன் (தாழ்மை)" }
      ]
    },
    shopping: {
      grammarNotes: ["கடை இருப்பை சரிபார்க்க 「〜はありますか」 என்பது நிலையான மரியாதையான வினவலாகும்.", "ஒரு ஊழியரின் கவனத்தை ஈர்க்க 「すみません」 என்பது பயன்படுத்தப்படுகிறது."],
      vocabulary: [
        { word: "お探しですか", reading: "おさがしですか", meaning: "ஏதேனும் தேடுகிறீர்களா?" },
        { word: "ありますか", reading: "ありますか", meaning: "இருக்கிறதா...?" }
      ]
    },
    restaurant: {
      grammarNotes: ["உணவுகளை ஆர்டர் செய்ய 「〜をお願いします」 என்பது பயன்படுத்தப்படுகிறது.", "ஆர்டர்களை எடுக்க 「お伺いします」 என்பது தாழ்மையான சொல்லாகும்."],
      vocabulary: [
        { word: "注文", reading: "ちゅうもん", meaning: "ஆர்டர் (உணவு)" },
        { word: "お伺いします", reading: "おうかがいします", meaning: "கேட்பது / ஆர்டர் எடுப்பது" }
      ]
    },
    travel: {
      grammarNotes: ["「〜まで」 என்பது '[இலக்கு] வரை' என்பதைக் குறிக்கிறது.", "டிக்கெட்டுகளை மரியாதையுடன் கேட்க 「〜をください」 என்பது பயன்படுத்தப்படுகிறது."],
      vocabulary: [
        { word: "指定席", reading: "していせき", meaning: "முன்பதிவு செய்யப்பட்ட இருக்கை" },
        { word: "切符", reading: "きっぷ", meaning: "டிக்கெட்" }
      ]
    },
    office: {
      grammarNotes: ["「でございます」 என்பது வணிகத்தில் பயன்படுத்தப்படும் மிகவும் மரியாதையான சொல்லாகும்.", "நபர் இருக்கிறாரா என்று கேட்க 「いらっしゃいますか」 என்பது பயன்படுத்தப்படுகிறது."],
      vocabulary: [
        { word: "お電話", reading: "おでんわ", meaning: "தொலைபேசி அழைப்பு" },
        { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "இருக்கிறாரா?" }
      ]
    },
    interview: {
      grammarNotes: ["திறமைகளை விவரிக்க 「私の強みは [சொற்றொடர்] ことです」 என்பது பயன்படுத்தப்படுகிறது.", "நேர்காணலில் சுய விளம்பரத்திற்கு 「自己PR」 என்பது நிலையான சொல்லாகும்."],
      vocabulary: [
        { word: "自己紹介", reading: "じこしょうかい", meaning: "சுய அறிமுகம்" },
        { word: "強み", reading: "つよみ", meaning: "முக்கிய பலம்" }
      ]
    },
    hospital: {
      grammarNotes: ["உடல் வலிகளை விவரிக்க 「〜が痛い」 என்பது பயன்படுத்தப்படுகிறது.", "மருத்துவர் அறிகுறிகளைப் பற்றிக் கேட்க 「どうされましたか」 என்பது பயன்படுத்தப்படுகிறது."],
      vocabulary: [
        { word: "症状", reading: "しょうじょう", meaning: "அறிகுறிகள்" },
        { word: "熱", reading: "ねつ", meaning: "காய்ச்சல்" }
      ]
    },
    school: {
      grammarNotes: ["அனுமதி கேட்க 「〜てもよろしいですか」 என்பது பயன்படுத்தப்படுகிறது.", "புரிந்துகொள்ள கடினமாக இருப்பதை 「分かりにくい」 என்பது குறிக்கிறது."],
      vocabulary: [
        { word: "文法", reading: "ぶんぽう", meaning: "இலக்கணம்" },
        { word: "質問", reading: "しつもん", meaning: "கேள்வி" }
      ]
    },
    business: {
      grammarNotes: ["நேரத்தை மரியாதையுடன் பெறுவதற்கு 「〜をいただき」 என்பது பயன்படுத்தப்படுகிறது.", "மதிப்பற்ற நேரத்தை 「貴重な」 என்பது குறிக்கிறது."],
      vocabulary: [
        { word: "本日は", reading: "ほんじつは", meaning: "இன்று (வணிக மொழி)" },
        { word: "貴重な", reading: "きちょうな", meaning: "மதிப்பற்ற / விலைமதிப்பற்ற" }
      ]
    }
  },
  ml: {
    greetings: {
      grammarNotes: ["സ്വയം പരിചയപ്പെടുത്തുമ്പോൾ 「〜と申します」 എന്നത് താഴ്മയുള്ള പദപ്രയോഗമാണ്.", "മറുപടി നൽകുമ്പോൾ 「こちらこそ」 എന്ന വാക്ക് ഉപയോഗിക്കുന്നു."],
      vocabulary: [
        { word: "初めまして", reading: "はじめまして", meaning: "കണ്ടുമുട്ടിയതിൽ സന്തോഷം" },
        { word: "申します", reading: "もうします", meaning: "എന്ന് വിളിക്കപ്പെടുന്നു (താഴ്മയുള്ള)" }
      ]
    },
    shopping: {
      grammarNotes: ["സാധനങ്ങൾ ഉണ്ടോ എന്ന് ചോദിക്കാൻ 「〜はありますか」 എന്നത് ഉപയോഗിക്കുന്നു.", "ശ്രദ്ധ ആകർഷിക്കാൻ 「すみません」 എന്ന് ഉപയോഗിക്കുന്നു."],
      vocabulary: [
        { word: "お探しですか", reading: "おさがしですか", meaning: "എന്തെങ്കിലും തിരയുകയാണോ?" },
        { word: "ありますか", reading: "ありますか", meaning: "ഉണ്ടോ...?" }
      ]
    },
    restaurant: {
      grammarNotes: ["ഭക്ഷണം ഓർഡർ ചെയ്യാൻ 「〜をお願いします」 എന്ന് ഉപയോഗിക്കുന്നു.", "ഓർഡറുകൾ സ്വീകരിക്കാൻ 「お伺いします」 എന്ന് ഉപയോഗിക്കുന്നു."],
      vocabulary: [
        { word: "注文", reading: "ちゅうもん", meaning: "ഓർഡർ (ഭക്ഷണം)" },
        { word: "お伺いします", reading: "おうかがいします", meaning: "ഓർഡർ സ്വീകരിക്കുക" }
      ]
    },
    travel: {
      grammarNotes: ["「〜まで」 എന്നത് '[ലക്ഷ്യസ്ഥാനം] വരെ' എന്ന് അർത്ഥമാക്കുന്നു.", "ടിക്കറ്റുകൾ ആവശ്യപ്പെടാൻ 「〜をください」 എന്ന് ഉപയോഗിക്കുന്നു."],
      vocabulary: [
        { word: "指定席", reading: "していせき", meaning: "റിസർവ് ചെയ്ത സീറ്റ്" },
        { word: "切符", reading: "きっぷ", meaning: "ടിക്കറ്റ്" }
      ]
    },
    office: {
      grammarNotes: ["ബിസിനസ്സ് സംഭാഷണങ്ങളിൽ 「でございます」 എന്നത് ഉപയോഗിക്കുന്നു.", "ആളുകൾ ഉണ്ടോ എന്ന് ചോദിക്കാൻ 「いらっしゃいますか」 എന്ന് ഉപയോഗിക്കുന്നു."],
      vocabulary: [
        { word: "お電話", reading: "おでんわ", meaning: "ടെലിഫോൺ കോൾ" },
        { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "ഉണ്ടോ?" }
      ]
    },
    interview: {
      grammarNotes: ["സ്വന്തം കഴിവുകൾ വിവരിക്കാൻ 「私の強みは [വാചകം] ことです」 എന്ന് ഉപയോഗിക്കുന്നു.", "സ്വയം പരിചയപ്പെടുത്തുന്നതിന് 「自己PR」 എന്ന് പറയുന്നു."],
      vocabulary: [
        { word: "自己紹介", reading: "じこしょうかい", meaning: "സ്വയം പരിചയപ്പെടുത്തൽ" },
        { word: "強み", reading: "つよみ", meaning: "പ്രധാന കരുത്ത്" }
      ]
    },
    hospital: {
      grammarNotes: ["ശാരീരിക അസ്വസ്ഥതകൾ പറയാൻ 「〜が痛い」 എന്ന് ഉപയോഗിക്കുന്നു.", "ഡോക്ടർ രോഗവിവരങ്ങൾ ചോദിക്കാൻ 「どうされましたか」 എന്ന് ഉപയോഗിക്കുന്നു."],
      vocabulary: [
        { word: "症状", reading: "しょうじょう", meaning: "രോഗലക്ഷണങ്ങൾ" },
        { word: "熱", reading: "ねつ", meaning: "പനി" }
      ]
    },
    school: {
      grammarNotes: ["അനുവാദം ചോദിക്കാൻ 「〜てもよろしいですか」 എന്ന് ഉപയോഗിക്കുന്നു.", "മനസ്സിലാക്കാൻ പ്രയാസമുള്ളതിനെ 「分かりにくい」 എന്ന് പറയുന്നു."],
      vocabulary: [
        { word: "文法", reading: "ぶんぽう", meaning: "വ്യാകരണം" },
        { word: "質問", reading: "しつもん", meaning: "ചോദ്യം" }
      ]
    },
    business: {
      grammarNotes: ["മര്യാദയോടെ സമയം ആവശ്യപ്പെടാൻ 「〜をいただき」 എന്ന് ഉപയോഗിക്കുന്നു.", "വിലയേറിയ സമയത്തെ 「貴重な」 എന്ന് അർത്ഥമാക്കുന്നു."],
      vocabulary: [
        { word: "本日は", reading: "ほんじつは", meaning: "ഇന്ന് (ബിസിനസ്സ്)" },
        { word: "貴重な", reading: "きちょうな", meaning: "വിലയേറിയ" }
      ]
    }
  },
  vi: {
    greetings: {
      grammarNotes: ["Sử dụng cấu trúc khiêm nhường 「〜と申します」 khi giới thiệu bản thân.", "Cụm từ 「こちらこそ」 dùng để đáp lại sự lịch sự của người nói."],
      vocabulary: [
        { word: "初めまして", reading: "はじめまして", meaning: "Rất hân hạnh được gặp bạn" },
        { word: "申します", reading: "もうします", meaning: "Được gọi là (Khiêm nhường)" }
      ]
    },
    shopping: {
      grammarNotes: ["Cấu trúc 「〜はありますか」 dùng để hỏi về hàng tồn kho cửa hàng.", "Từ 「すみません」 dùng lịch sự để gọi nhân viên."],
      vocabulary: [
        { word: "お探しですか", reading: "おさがしですか", meaning: "Bạn đang tìm kiếm gì đó phải không?" },
        { word: "ありますか", reading: "ありますか", meaning: "Bạn có... không?" }
      ]
    },
    restaurant: {
      grammarNotes: ["Dùng cấu trúc 「〜をお願いします」 để gọi món ăn lịch sự.", "Cấu trúc khiêm nhường 「お伺いします」 dùng để nhận yêu cầu."],
      vocabulary: [
        { word: "注文", reading: "ちゅうもん", meaning: "Gọi món / đặt hàng" },
        { word: "お伺いします", reading: "おうかがいします", meaning: "Nhận yêu cầu / hỏi han" }
      ]
    },
    travel: {
      grammarNotes: ["Cấu trúc 「〜まで」 mang ý nghĩa 'cho đến [địa điểm]'.", "Cấu trúc 「〜をください」 dùng để xin vé một cách lịch sự."],
      vocabulary: [
        { word: "指定席", reading: "していせき", meaning: "Ghế đặt trước" },
        { word: "切符", reading: "きっぷ", meaning: "Vé" }
      ]
    },
    office: {
      grammarNotes: ["Đuôi từ lịch sự 「でございます」 thay thế cho 「です」 trong công sở.", "Kính ngữ 「いらっしゃいますか」 dùng hỏi xem sếp/khách có ở đó không."],
      vocabulary: [
        { word: "お電話", reading: "おdeንわ", meaning: "Điện thoại / cuộc gọi" },
        { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "Có mặt ở đây không?" }
      ]
    },
    interview: {
      grammarNotes: ["Cấu trúc: 「私の強みは [Vế câu] ことです」 dùng để trình bày thế mạnh.", "Thuật ngữ 「自己PR」 dùng để chỉ việc PR bản thân trong phỏng vấn."],
      vocabulary: [
        { word: "自己紹介", reading: "じこしょうかい", meaning: "Giới thiệu bản thân" },
        { word: "強み", reading: "つよみ", meaning: "Thế mạnh / ưu điểm" }
      ]
    },
    hospital: {
      grammarNotes: ["Sử dụng 「〜が痛い」 để miêu tả cơn đau cụ thể.", "Câu hỏi 「どうされましたか」 dùng hỏi thăm tình trạng bệnh nhân."],
      vocabulary: [
        { word: "症状", reading: "しょうじょう", meaning: "Triệu chứng" },
        { word: "熱", reading: "ねつ", meaning: "Sốt" }
      ]
    },
    school: {
      grammarNotes: ["Mẫu câu 「〜てもよろしいですか」 dùng để xin phép một cách lịch sự.", "Cụm từ 「分かりにくい」 có nghĩa là khó hiểu."],
      vocabulary: [
        { word: "文法", reading: "ぶんぽう", meaning: "Ngữ pháp" },
        { word: "質問", reading: "しつもん", meaning: "Câu hỏi" }
      ]
    },
    business: {
      grammarNotes: ["Mẫu câu 「〜をいただき」 thể hiện lòng biết ơn khi nhận thời gian quý báu.", "Tính từ 「貴重な」 có nghĩa là quý báu."],
      vocabulary: [
        { word: "本日は", reading: "ほんじつは", meaning: "Hôm nay (Văn viết trang trọng)" },
        { word: "貴重な", reading: "きちょうな", meaning: "Quý báu / giá trị" }
      ]
    }
  },
  th: {
    greetings: {
      grammarNotes: ["การใช้ 「〜と申します」 เป็นรูปถ่อมตนอย่างสุภาพเมื่อแนะนำตัวเอง", "คำว่า 「こちらこそ」 ใช้ตอบรับไมตรีอย่างสุภาพกลับไปยังผู้พูด"],
      vocabulary: [
        { word: "初めまして", reading: "はじめまして", meaning: "ยินดีที่ได้รู้จัก" },
        { word: "申します", reading: "もうします", meaning: "เรียกว่า (รูปถ่อมตน)" }
      ]
    },
    shopping: {
      grammarNotes: ["โครงสร้าง 「〜はありますか」 เป็นคำถามสุภาพมาตรฐานเพื่อเช็กสินค้า", "คำว่า 「すみません」 ใช้ขออนุญาตอย่างสุภาพเพื่อเรียกพนักงาน"],
      vocabulary: [
        { word: "お探しですか", reading: "おさがしですか", meaning: "กำลังหาอะไรอยู่หรือเปล่าครับ?" },
        { word: "ありますか", reading: "ありますか", meaning: "มี... ไหม?" }
      ]
    },
    restaurant: {
      grammarNotes: ["ใช้ 「〜をお願いします」 เพื่อสั่งอาหารหรือขอความช่วยเหลืออย่างสุภาพ", "คำว่า 「お伺いします」 เป็นคำกริยาถ่อมตนที่แปลว่าสอบถามหรือรับออเดอร์"],
      vocabulary: [
        { word: "注文", reading: "ちゅうもん", meaning: "สั่งอาหาร / ออเดอร์" },
        { word: "お伺いします", reading: "おうかがいします", meaning: "รับออเดอร์ / สอบถาม" }
      ]
    },
    travel: {
      grammarNotes: ["คำว่า 「〜まで」 หมายถึง 'ไปจนถึง [จุดหมาย]' ", "โครงสร้าง 「〜をください」 ใช้เพื่อขอซื้อตั๋วอย่างสุภาพ"],
      vocabulary: [
        { word: "指定席", reading: "していせき", meaning: "ที่นั่งระบุล่วงหน้า / ที่นั่งจอง" },
        { word: "切符", reading: "きっぷ", meaning: "ตั๋ว" }
      ]
    },
    office: {
      grammarNotes: ["คำว่า 「でございます」 เป็นรูปสุภาพสุภาพมากในแวดวงธุรกิจแทนคำว่า 「です」", "คำว่า 「いらっしゃいますか」 เป็นรูปสุภาพยกย่องของคำว่า 「いますか」"],
      vocabulary: [
        { word: "お電話", reading: "おでんわ", meaning: "โทรศัพท์ / สายเรียกเข้า" },
        { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "อยู่ไหมครับ?" }
      ]
    },
    interview: {
      grammarNotes: ["โครงสร้าง: 「私の強みは [วลี] ことです」 ใช้เพื่อระบุจุดเด่นอย่างชัดเจน", "คำว่า 「自己PR」 คือคำเรียกมาตรฐานของการโปรโมตตัวเองในการสัมภาษณ์งาน"],
      vocabulary: [
        { word: "自己紹介", reading: "じこしょうかい", meaning: "แนะนำตัว" },
        { word: "強み", reading: "つよみ", meaning: "จุดเด่น / ข้อดี" }
      ]
    },
    hospital: {
      grammarNotes: ["ใช้ 「〜が痛い」 เพื่ออธิบายอาการเจ็บป่วยทางร่างกายเฉพาะเจาะจง", "คำว่า 「どうされましたか」 เป็นคำที่หมอใช้ถามอาการคนไข้"],
      vocabulary: [
        { word: "症状", reading: "しょうじょう", meaning: "อาการป่วย" },
        { word: "熱", reading: "ねつ", meaning: "ไข้" }
      ]
    },
    school: {
      grammarNotes: ["การขออนุญาตอย่างสุภาพถ่อมตนใช้โครงสร้าง 「〜てもよろしいですか」", "คำว่า 「分かりにくい」 แปลว่ายากที่จะเข้าใจ"],
      vocabulary: [
        { word: "文法", reading: "ぶんぽう", meaning: "ไวยากรณ์" },
        { word: "質問", reading: "しつもん", meaning: "คำถาม" }
      ]
    },
    business: {
      grammarNotes: ["การได้รับเวลาที่มีค่าอย่างสุภาพถ่อมตนใช้โครงสร้าง 「〜をいただき」", "คำว่า 「貴重な」 หมายถึง มีค่าอย่างยิ่ง"],
      vocabulary: [
        { word: "本日は", reading: "ほんじつは", meaning: "วันนี้ (ภาษาธุรกิจสุภาพ)" },
        { word: "貴重な", reading: "きちょうな", meaning: "มีค่า / ล้ำค่า" }
      ]
    }
  },
  ko: {
    greetings: {
      grammarNotes: ["자기소개 시 「〜と申します」를 사용하는 것은 정중하고 겸손한 표현입니다.", "「こちらこそ」는 상대방의 정중한 인사에 보답하는 표현입니다."],
      vocabulary: [
        { word: "初めまして", reading: "はじめまして", meaning: "처음 뵙겠습니다" },
        { word: "申します", reading: "もうします", meaning: "~라고 합니다 (겸양어)" }
      ]
    },
    shopping: {
      grammarNotes: ["가게 재고를 확인할 때 「〜はありますか」는 표준 정중 표현입니다.", "점원의 주의를 끌 때 「すみません」을 정중하게 사용합니다."],
      vocabulary: [
        { word: "お探しですか", reading: "おさがしですか", meaning: "찾으시는 것이 있습니까?" },
        { word: "ありますか", reading: "ありますか", meaning: "있습니까...?" }
      ]
    },
    restaurant: {
      grammarNotes: ["음식을 주문할 때 「〜をお願いします」를 사용합니다.", "주문을 받을 때 「お伺いします」라는 겸손 표현을 씁니다."],
      vocabulary: [
        { word: "注文", reading: "ちゅうもん", meaning: "주문 / 요리 주문" },
        { word: "お伺いします", reading: "おうかがいします", meaning: "주문을 받다 / 여쭙다" }
      ]
    },
    travel: {
      grammarNotes: ["「〜まで」는 '[목적지]까지'를 나타냅니다.", "표를 정중하게 요청할 때 「〜をください」를 사용합니다."],
      vocabulary: [
        { word: "指定席", reading: "していせき", meaning: "지정석" },
        { word: "切符", reading: "きっぷ", meaning: "표 / 티켓" }
      ]
    },
    office: {
      grammarNotes: ["「でございます」는 비즈니스 상황에서 정중하게 「です」 대신 사용합니다.", "존경어 「いらっしゃいますか」는 「いますか」의 높은 말입니다."],
      vocabulary: [
        { word: "お電話", reading: "おでんわ", meaning: "전화 / 전화 통화" },
        { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "계십니까?" }
      ]
    },
    interview: {
      grammarNotes: ["구조: 「私の強みは [구절] ことです」는 자신의 장점을 명확히 설명합니다.", "「自己PR」는 면접 시 자기 홍보를 가리키는 표준 표현입니다."],
      vocabulary: [
        { word: "自己紹介", reading: "じこしょうかい", meaning: "자기소개" },
        { word: "強み", reading: "つよみ", meaning: "핵심 장점" }
      ]
    },
    hospital: {
      grammarNotes: ["특정 신체 통증을 설명할 때 「〜が痛い」를 사용합니다.", "의사가 증상을 물어볼 때 「どうされましたか」를 사용합니다."],
      vocabulary: [
        { word: "症状", reading: "しょうじょう", meaning: "증상 / 증세" },
        { word: "熱", reading: "ねつ", meaning: "열" }
      ]
    },
    school: {
      grammarNotes: ["허락을 구할 때 정중한 표현인 「〜てもよろしいですか」를 사용합니다.", "이해하기 어려움을 의미할 때는 「分かりにくい」를 씁니다."],
      vocabulary: [
        { word: "文法", reading: "ぶんぽう", meaning: "문법" },
        { word: "質問", reading: "しつもん", meaning: "질문" }
      ]
    },
    business: {
      grammarNotes: ["시간을 내어준 것에 정중히 감사할 때 「〜をいただき」를 사용합니다.", "귀중한 시간을 뜻할 때 「貴重な」를 사용합니다."],
      vocabulary: [
        { word: "本日は", reading: "ほんじつは", meaning: "오늘은 (비즈니스 서면어)" },
        { word: "貴重な", reading: "きちょうな", meaning: "귀중한 / 값진" }
      ]
    }
  },
  zh: {
    greetings: {
      grammarNotes: ["自我介绍时使用谦逊语「〜と申します」显得更加有礼貌。", "「こちらこそ」用于礼貌地向对方回敬同样的敬意。"],
      vocabulary: [
        { word: "初めまして", reading: "はじめまして", meaning: "初次见面，请多关照" },
        { word: "申します", reading: "もうします", meaning: "被称为... (自谦)" }
      ]
    },
    shopping: {
      grammarNotes: ["查询店内库存时，使用「〜はありますか」是标准礼貌询问方式。", "使用「すみません」可以礼貌地引起店员的注意。"],
      vocabulary: [
        { word: "お探しですか", reading: "おさがしですか", meaning: "您在寻找什么东西吗？" },
        { word: "ありますか", reading: "ありますか", meaning: "您有...吗？" }
      ]
    },
    restaurant: {
      grammarNotes: ["点餐时，使用「〜をお願いします」可以非常有礼貌地表达需求。", "「お伺いします」是谦逊语，意思是询问或记录点餐。"],
      vocabulary: [
        { word: "注文", reading: "ちゅうもん", meaning: "点餐 / 订单" },
        { word: "お伺いします", reading: "おうかがいします", meaning: "询问 / 点餐" }
      ]
    },
    travel: {
      grammarNotes: ["「〜まで」表示“一直到[目的地]”。", "买票时，使用「〜をください」礼貌地表达需要该票。"],
      vocabulary: [
        { word: "指定席", reading: "していせき", meaning: "预定座位 / 订座" },
        { word: "切符", reading: "きっぷ", meaning: "票 / 车票" }
      ]
    },
    office: {
      grammarNotes: ["「でございます」是商务日语中代替「です」的极度礼貌谦逊表达方式。", "敬语「いらっしゃいますか」是「いますか」的敬体形式。"],
      vocabulary: [
        { word: "お電話", reading: "おでんわ", meaning: "电话 / 来电" },
        { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "在吗？ (尊称)" }
      ]
    },
    interview: {
      grammarNotes: ["句型结构：「私の強みは [短语] ことです」可以清晰阐述个人优势。", "「自己PR」是日语面试中自我展示、推销的标配术语。"],
      vocabulary: [
        { word: "自己紹介", reading: "じこしょうかい", meaning: "自我介绍" },
        { word: "強み", reading: "つよみ", meaning: "核心优势 / 优点" }
      ]
    },
    hospital: {
      grammarNotes: ["使用「〜が痛い」来描述特定身体部位的疼痛或不适。", "「どうされましたか」是医生询问病人症状的礼貌用语。"],
      vocabulary: [
        { word: "症状", reading: "しょうじょう", meaning: "疾病症状" },
        { word: "熱", reading: "ねつ", meaning: "发烧" }
      ]
    },
    school: {
      grammarNotes: ["向老师请教问题时，使用「〜てもよろしいですか」表示礼貌地征求许可。", "「分かりにくい」意为“难以理解、不明白”。"],
      vocabulary: [
        { word: "文法", reading: "ぶんぽう", meaning: "语法规则" },
        { word: "質問", reading: "しつもん", meaning: "提问" }
      ]
    },
    business: {
      grammarNotes: ["「〜をいただき」表示自谦地接受对方宝贵的时间或款待。", "「貴重な」表示极其珍贵、有价值的。"],
      vocabulary: [
        { word: "本日は", reading: "ほんじつは", meaning: "今天 (商务正式口吻)" },
        { word: "貴重な", reading: "きちょうな", meaning: "宝贵的 / 珍贵的" }
      ]
    }
  }
};

export function ConversationLabClient({ initialLessons }: { initialLessons: ConversationLessonData[] }) {
  const [lessons, setLessons] = useState<ConversationLessonData[]>(initialLessons);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedLesson, setSelectedLesson] = useState<ConversationLessonData>(initialLessons[0] || null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingScore, setRecordingScore] = useState<number | null>(null);

  // Dynamic explanation language state (Prompt 11: Multi-language speaking explanations)
  const [explanationLang, setExplanationLang] = useState<"en" | "ta" | "ml" | "vi" | "th" | "ko" | "zh">("en");

  const categories = [
    { key: "all", label: "All Situations" },
    { key: "greetings", label: "1. Greetings" },
    { key: "shopping", label: "2. Shopping" },
    { key: "restaurant", label: "3. Restaurant" },
    { key: "travel", label: "4. Travel" },
    { key: "office", label: "5. Office" },
    { key: "interview", label: "6. Interview" },
    { key: "hospital", label: "7. Hospital" },
    { key: "school", label: "8. School" },
    { key: "business", label: "9. Business" },
  ];

  const filtered = activeCategory === "all"
    ? lessons
    : lessons.filter((l) => l.category === activeCategory);

  const toggleComplete = async (lessonId: number) => {
    const updatedStatus = !selectedLesson.isCompleted;
    setLessons((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, isCompleted: updatedStatus } : l)),
    );
    setSelectedLesson((prev) => ({ ...prev, isCompleted: updatedStatus }));

    try {
      await fetch("/api/v1/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, isCompleted: updatedStatus }),
      });
    } catch {}
  };

  const handleRecordPronunciation = () => {
    setIsRecording(true);
    setRecordingScore(null);
    setTimeout(() => {
      setIsRecording(false);
      setRecordingScore(94);
    }, 2000);
  };

  // Resolve dynamic explanations based on selected language
  const resolvedExplanations =
    MULTILINGUAL_EXPLANATIONS[explanationLang]?.[selectedLesson?.category || "greetings"] ||
    MULTILINGUAL_EXPLANATIONS["en"]?.[selectedLesson?.category || "greetings"];

  return (
    <div className="space-y-8 font-sans max-w-5xl mx-auto">
      {/* Category Pills for 9 Situations */}
      <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-xl px-3 py-1.5 transition cursor-pointer ${
              activeCategory === cat.key
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-black/5"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main 2-Column Conversation Lab Platform */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Left Column: Lesson Selector */}
        <div className="space-y-3 lg:col-span-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Select Dialogue ({filtered.length} Available)
          </p>
          <div className="space-y-2">
            {filtered.map((l) => {
              const isSelected = selectedLesson?.id === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => setSelectedLesson(l)}
                  className={`rounded-2xl p-4 transition cursor-pointer border shadow-2xs ${
                    isSelected
                      ? "bg-rose-50 border-rose-500 ring-2 ring-rose-500"
                      : "bg-white border-black/5 hover:border-rose-300"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                    <span className="text-rose-700">{l.difficultyLevel || "N5"}</span>
                    {l.isCompleted && <span className="text-emerald-700">✓ Completed</span>}
                  </div>
                  <p className="font-bold text-xs text-slate-950 mt-1">{l.title}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Full Interactive Dialogue & Role Play Pane */}
        {selectedLesson && (
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-4">
              <div>
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                  {selectedLesson.difficultyLevel} • {selectedLesson.category}
                </span>
                <h2 className="text-xl font-bold text-slate-950 mt-1">{selectedLesson.title}</h2>
                <p className="text-xs text-slate-600 mt-0.5">{selectedLesson.situation}</p>
              </div>

              <button
                onClick={() => toggleComplete(selectedLesson.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  selectedLesson.isCompleted
                    ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {selectedLesson.isCompleted ? "✓ Completed Lesson" : "Mark as Complete"}
              </button>
            </div>

            {/* Interactive Dialogue Chat Bubbles */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Interactive Line-by-Line Dialogue 🗣️
              </h3>
              <div className="space-y-3">
                {selectedLesson.dialogues.map((d, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl p-4 space-y-1 text-xs border ${
                      d.role === "User"
                        ? "bg-rose-50/80 border-rose-200/70 ml-4 sm:ml-8"
                        : "bg-slate-50 border-slate-200 mr-4 sm:mr-8"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-[10px] uppercase text-slate-500">
                      <span className={d.role === "User" ? "text-rose-700" : "text-slate-900"}>
                        {d.speaker} ({d.role})
                      </span>
                      <span className="cursor-pointer text-rose-600 hover:underline">🔊 Play Audio</span>
                    </div>
                    <p className="text-base font-bold text-slate-950">{d.japanese}</p>
                    <p className="text-[11px] text-rose-600 font-medium">{d.furigana}</p>
                    <p className="text-[11px] text-slate-600 italic">{d.english}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pronunciation Recording Box */}
            <div className="rounded-2xl bg-slate-900 p-6 text-white space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
                  🎙️ Pronunciation Recorder &amp; AI Pitch Check
                </span>
                {recordingScore && (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
                    Accuracy: {recordingScore}% Perfect
                  </span>
                )}
              </div>

              <p className="text-xs opacity-80">
                Role Play Prompt: {selectedLesson.rolePlayPrompt || "Speak your dialogue line into your microphone."}
              </p>

              <button
                onClick={handleRecordPronunciation}
                className={`rounded-xl px-5 py-2.5 text-xs font-bold transition cursor-pointer shadow-xs ${
                  isRecording ? "bg-rose-600 animate-pulse" : "bg-white text-slate-900 hover:bg-slate-100"
                }`}
              >
                {isRecording ? "🔴 Listening to Japanese speech..." : "🎙️ Hold to Record & Verify"}
              </button>
            </div>

            {/* Language Selector for Explanations (Prompt 11 Multilingual explanations) */}
            <div className="rounded-2xl bg-slate-100 p-4 border border-black/5 space-y-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                🌐 Select Explanation Language (Grammar &amp; Vocabulary)
              </p>
              <div className="flex flex-wrap gap-1">
                {[
                  { code: "en", label: "English" },
                  { code: "ta", label: "Tamil (தமிழ்)" },
                  { code: "ml", label: "Malayalam (മലയാളം)" },
                  { code: "vi", label: "Vietnamese (Tiếng Việt)" },
                  { code: "th", label: "Thai (ไทย)" },
                  { code: "ko", label: "Korean (한국어)" },
                  { code: "zh", label: "Chinese (中文)" },
                ].map((item) => {
                  const isActive = explanationLang === item.code;
                  return (
                    <button
                      key={item.code}
                      onClick={() => setExplanationLang(item.code as any)}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-bold cursor-pointer transition ${
                        isActive ? "bg-slate-900 text-white shadow-3xs" : "text-slate-600 hover:text-slate-950 bg-white border border-black/5"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grammar Notes & Vocabulary for this conversation */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 text-xs">
              <div className="space-y-1.5">
                <p className="font-bold text-slate-900">💡 Localized Grammar Notes</p>
                {resolvedExplanations.grammarNotes.map((g, i) => (
                  <p key={i} className="text-slate-600 text-[11px] leading-relaxed">
                    • {g}
                  </p>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="font-bold text-slate-900">📚 Localized Dialogue Vocabulary</p>
                {resolvedExplanations.vocabulary.map((v, i) => (
                  <p key={i} className="text-slate-700 text-[11px] leading-relaxed">
                    <b className="text-slate-950">{v.word}</b> ({v.reading}): {v.meaning}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
