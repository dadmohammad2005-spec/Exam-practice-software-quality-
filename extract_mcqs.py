import pypdf
import re
import json
import os

def clean_str(s):
    if not s:
        return ''
    s = s.replace('\r\n', '\n').replace('\r', '\n')
    # normalize quotes & apostrophes
    s = s.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
    s = s.replace('“', '"').replace('”', '"').replace('’', "'").replace('‘', "'")
    # clean extra whitespace
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()

all_questions = []
qid = 1

# ==========================================
# 1. Parse Software Quality Engineering – MCQ Bank.pdf (175 MCQs)
# ==========================================
bank_file = 'Software Quality Engineering – MCQ Bank.pdf'
if os.path.exists(bank_file):
    print(f"Reading {bank_file}...")
    r_bank = pypdf.PdfReader(bank_file)
    full_bank = '\n'.join([p.extract_text() or '' for p in r_bank.pages])

    sets = list(re.finditer(r'(Set \d+:[^\n]+)', full_bank))
    for i in range(len(sets)):
        set_title = clean_str(sets[i].group(1))
        start = sets[i].start()
        end = sets[i+1].start() if i+1 < len(sets) else len(full_bank)
        s_text = full_bank[start:end]
        
        if 'Module 01' in set_title or 'Discipline' in set_title:
            topic = 'SQE Discipline (Module 01)'
        elif 'Lecture 1' in set_title:
            topic = 'SQE Lecture 1 (Quality Concepts & Specs)'
        elif 'Lecture 2' in set_title:
            topic = 'SQE Lecture 2 (Quality Types & SQA Plans)'
        elif 'Module 02' in set_title or 'Cost' in set_title:
            topic = 'Cost of Software Quality (Module 02)'
        elif 'Quality Assurance' in set_title:
            topic = 'Quality Assurance Basics & Defect Prevention'
        else:
            topic = set_title

        q_matches = list(re.finditer(r'(?:(?:\n|^)(?:🔄\s*NEW\s*—\s*)?(Q\d+)[\.:])', s_text))
        for qi in range(len(q_matches)):
            q_label = q_matches[qi].group(1)
            q_start = q_matches[qi].end()
            q_end = q_matches[qi+1].start() if qi+1 < len(q_matches) else len(s_text)
            block = s_text[q_start:q_end].strip()
            
            ans_match = re.search(r'\nAnswer:\s*([A-D])', block, re.IGNORECASE)
            ans = ans_match.group(1).upper() if ans_match else ''
            
            expl_match = re.search(r'\nExplanation:\s*(.*)', block, re.DOTALL | re.IGNORECASE)
            expl = clean_str(expl_match.group(1)) if expl_match else ''
            
            opt_part = block[:ans_match.start()] if ans_match else block
            opt_matches = list(re.finditer(r'(?:^|\n)\s*[•\-\*]?\s*([A-D])[\.:\)]\s*', opt_part))
            
            q_text = clean_str(opt_part[:opt_matches[0].start()]) if opt_matches else ''
            opts = {}
            for oi in range(len(opt_matches)):
                letter = opt_matches[oi].group(1).upper()
                o_start = opt_matches[oi].end()
                o_end = opt_matches[oi+1].start() if oi+1 < len(opt_matches) else len(opt_part)
                opts[letter] = clean_str(opt_part[o_start:o_end])
                
            all_questions.append({
                'id': qid,
                'source_file': bank_file,
                'source_name': 'Comprehensive MCQ Bank (175 MCQs)',
                'set_name': set_title,
                'topic': topic,
                'question_number': q_label,
                'question': q_text,
                'options': opts,
                'answer': ans,
                'explanation': expl
            })
            qid += 1

print(f"Parsed {len(all_questions)} questions from MCQ Bank.")

# ==========================================
# 2. Parse SQE.pdf (35 MCQs)
# ==========================================
sqe_file = 'SQE.pdf'
if os.path.exists(sqe_file):
    print(f"Reading {sqe_file}...")
    r_sqe = pypdf.PdfReader(sqe_file)
    paper_text = '\n'.join([p.extract_text() or '' for p in r_sqe.pages[1:9]])
    paper_text = re.sub(r'SQE MCQ Paper\s*\|\s*Page \d+', '', paper_text)

    # Extract teacher verification notes
    notes_text = '\n'.join([p.extract_text() or '' for p in r_sqe.pages[10:16]])
    notes_text = re.sub(r'SQE MCQ Paper\s*\|\s*Page \d+', '', notes_text)
    note_blocks = re.split(r'Question\s+(\d+)\s+\|\s+Answer:\s+([A-D])', notes_text)
    notes_dict = {}
    for ni in range(1, len(note_blocks), 3):
        q_num = int(note_blocks[ni])
        ans_key = note_blocks[ni+1]
        content = clean_str(note_blocks[ni+2])
        notes_dict[q_num] = {'answer': ans_key, 'explanation': content}

    q_matches_sqe = list(re.finditer(r'(?:^|\n)(\d+)\.\s+', paper_text))
    for qi in range(len(q_matches_sqe)):
        q_num = int(q_matches_sqe[qi].group(1))
        start = q_matches_sqe[qi].end()
        end = q_matches_sqe[qi+1].start() if qi+1 < len(q_matches_sqe) else len(paper_text)
        block = paper_text[start:end].strip()
        
        opt_matches = list(re.finditer(r'(?:^|\n)\s*(✔\s*)?([A-D])\.\s+', block))
        q_text = clean_str(block[:opt_matches[0].start()]) if opt_matches else ''
        opts = {}
        correct = None
        for oi in range(len(opt_matches)):
            is_check = bool(opt_matches[oi].group(1))
            letter = opt_matches[oi].group(2)
            o_start = opt_matches[oi].end()
            o_end = opt_matches[oi+1].start() if oi+1 < len(opt_matches) else len(block)
            opts[letter] = clean_str(block[o_start:o_end])
            if is_check:
                correct = letter
                
        note_info = notes_dict.get(q_num, {})
        expl = note_info.get('explanation', '')
        if not correct and note_info.get('answer'):
            correct = note_info.get('answer')
        
        topic = 'SQE Comprehensive Examination'
        if 'lec_1' in expl.lower():
            topic = 'SQE Lecture 1 (Quality Concepts & Specs)'
        elif 'lec_2' in expl.lower():
            topic = 'SQE Lecture 2 (Quality Types & SQA Plans)'
        elif 'discipline' in expl.lower() or 'module 1' in expl.lower():
            topic = 'SQE Discipline (Module 01)'
        elif 'cost' in expl.lower() or 'module 02' in expl.lower() or 'module 2' in expl.lower():
            topic = 'Cost of Software Quality (Module 02)'
        elif 'quality_assurance' in expl.lower() or 'qa' in expl.lower():
            topic = 'Quality Assurance Basics & Defect Prevention'

        all_questions.append({
            'id': qid,
            'source_file': sqe_file,
            'source_name': 'SQE Official Exam Paper (35 MCQs)',
            'set_name': 'Official SQE MCQ Examination',
            'topic': topic,
            'question_number': f'Q{q_num}',
            'question': q_text,
            'options': opts,
            'answer': correct,
            'explanation': expl
        })
        qid += 1

print(f"Total questions after SQE.pdf: {len(all_questions)}")

# ==========================================
# 3. Parse SQE_MCQs (1).pdf (35 MCQs)
# ==========================================
mcqs_file = 'SQE_MCQs (1).pdf'
if os.path.exists(mcqs_file):
    print(f"Reading {mcqs_file}...")
    r_mcqs = pypdf.PdfReader(mcqs_file)
    full_mcqs = '\n'.join([p.extract_text() or '' for p in r_mcqs.pages])

    topic_names = [
        'Quality Assurance Basics',
        'SQE Discipline',
        'Cost of Software Quality',
        'Lecture 1',
        'Lecture 2'
    ]

    topic_mapping = [
        'Quality Assurance Basics & Defect Prevention',
        'SQE Discipline (Module 01)',
        'Cost of Software Quality (Module 02)',
        'SQE Lecture 1 (Quality Concepts & Specs)',
        'SQE Lecture 2 (Quality Types & SQA Plans)'
    ]

    blocks = re.split(r'(?:^|\n)Q:\s*', full_mcqs)[1:]
    for bi, blk in enumerate(blocks):
        topic_idx = min(bi // 7, len(topic_mapping) - 1)
        topic = topic_mapping[topic_idx]
        
        ans_match = re.search(r'\ncorrect answer\s*:\s*([a-d])\)?\s*(.*)', blk, re.IGNORECASE)
        ans_letter = ans_match.group(1).upper() if ans_match else ''
        ans_text = clean_str(ans_match.group(2)) if ans_match else ''
        
        opts_part = blk[:ans_match.start()] if ans_match else blk
        opt_matches = list(re.finditer(r'(?:^|\n)\s*([a-d])\)\s*', opts_part))
        q_text = clean_str(opts_part[:opt_matches[0].start()]) if opt_matches else ''
        
        opts = {}
        for oi in range(len(opt_matches)):
            letter = opt_matches[oi].group(1).upper()
            o_start = opt_matches[oi].end()
            o_end = opt_matches[oi+1].start() if oi+1 < len(opt_matches) else len(opts_part)
            opts[letter] = clean_str(opts_part[o_start:o_end])
            
        all_questions.append({
            'id': qid,
            'source_file': mcqs_file,
            'source_name': 'SQE Quick Drills (35 MCQs)',
            'set_name': topic_names[topic_idx],
            'topic': topic,
            'question_number': f'Q{(bi % 7) + 1}',
            'question': q_text,
            'options': opts,
            'answer': ans_letter,
            'explanation': f'Correct Answer is option ({ans_letter}): {opts.get(ans_letter, ans_text)}'
        })
        qid += 1

print(f"Total questions parsed: {len(all_questions)}")

# Write to questions.json
with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(all_questions, f, indent=2, ensure_ascii=False)

print("Saved questions.json successfully!")
