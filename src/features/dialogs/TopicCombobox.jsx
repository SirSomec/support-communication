import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { filterTopicOptions, findTopicMatch } from "./topicSearchModel.js";
import "./topic-combobox.css";

// Комбобокс тематики: оператор вводит первые символы названия и выбирает
// тематику из отфильтрованного списка (мышью или стрелками + Enter).
// Значение меняется только выбором опции из справочника: произвольный
// текст при потере фокуса откатывается к выбранной тематике.
export function TopicCombobox({
  ariaLabel = "Тематика",
  disabled = false,
  inputId,
  onChange,
  options = [],
  placeholder = "Не выбрана",
  value = ""
}) {
  const [draft, setDraft] = useState(null);
  const [isOpen, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();

  const visibleOptions = useMemo(
    () => (draft === null ? filterTopicOptions(options, "") : filterTopicOptions(options, draft)),
    [draft, options]
  );

  // Смена диалога (или сохранение тематики извне) сбрасывает незавершенный ввод.
  useEffect(() => {
    setDraft(null);
    setOpen(false);
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const activeOption = document.getElementById(optionId(listId, activeIndex));
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, listId, visibleOptions]);

  function openList() {
    if (disabled || isOpen) {
      return;
    }
    const selectedIndex = draft === null ? visibleOptions.indexOf(value) : -1;
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
    setOpen(true);
  }

  function closeList({ resetDraft = true } = {}) {
    setOpen(false);
    if (resetDraft) {
      setDraft(null);
    }
  }

  function selectOption(option) {
    closeList();
    if (option !== value) {
      onChange?.(option);
    } else {
      setDraft(null);
    }
  }

  function handleInput(event) {
    if (disabled) {
      return;
    }
    setDraft(event.target.value);
    setActiveIndex(0);
    setOpen(true);
  }

  function handleKeyDown(event) {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openList();
        return;
      }
      if (!visibleOptions.length) {
        return;
      }
      const shift = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + shift + visibleOptions.length) % visibleOptions.length);
      return;
    }
    if (event.key === "Enter") {
      if (isOpen && visibleOptions[activeIndex] !== undefined) {
        event.preventDefault();
        selectOption(visibleOptions[activeIndex]);
      }
      return;
    }
    if (event.key === "Escape") {
      if (isOpen) {
        // Открытый список закрывается сам и не отдает Escape модалке.
        event.stopPropagation();
        event.preventDefault();
        closeList();
      }
      return;
    }
    if (event.key === "Tab") {
      closeList();
    }
  }

  function handleToggle() {
    if (disabled) {
      return;
    }
    if (isOpen) {
      closeList();
      return;
    }
    inputRef.current?.focus();
    openList();
  }

  function handleClear() {
    if (disabled) {
      return;
    }
    setDraft(null);
    setOpen(false);
    if (value) {
      onChange?.("");
    }
  }

  const inputValue = draft ?? value;
  const showClear = Boolean(value) && !disabled;

  return (
    <div className={`topic-combobox${disabled ? " is-disabled" : ""}`}>
      <div className="topic-combobox-control">
        <input
          aria-activedescendant={isOpen && visibleOptions.length ? optionId(listId, activeIndex) : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          autoComplete="off"
          className="topic-combobox-input"
          disabled={disabled}
          id={inputId}
          onBlur={() => closeList()}
          onChange={handleInput}
          onClick={openList}
          onFocus={openList}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          type="text"
          value={inputValue}
        />
        {showClear ? (
          <button
            aria-label="Сбросить тематику"
            className="topic-combobox-clear"
            onClick={handleClear}
            onMouseDown={(event) => event.preventDefault()}
            tabIndex={-1}
            title="Сбросить тематику"
            type="button"
          >
            <X size={14} />
          </button>
        ) : null}
        <button
          aria-label={isOpen ? "Свернуть список тематик" : "Показать список тематик"}
          className="topic-combobox-toggle"
          disabled={disabled}
          onClick={handleToggle}
          onMouseDown={(event) => event.preventDefault()}
          tabIndex={-1}
          title="Список тематик"
          type="button"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {isOpen && !disabled ? (
        <ul aria-label="Тематики" className="topic-combobox-list" id={listId} onMouseDown={(event) => event.preventDefault()} role="listbox">
          {visibleOptions.map((option, index) => (
            <li
              aria-selected={option === value}
              className={`topic-combobox-option${index === activeIndex ? " is-active" : ""}${option === value ? " is-selected" : ""}`}
              id={optionId(listId, index)}
              key={option}
              onClick={() => selectOption(option)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <OptionLabel option={option} query={draft ?? ""} />
            </li>
          ))}
          {!visibleOptions.length ? (
            <li className="topic-combobox-empty" role="presentation">
              Ничего не найдено. Измените запрос или очистите поле.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function OptionLabel({ option, query }) {
  const match = findTopicMatch(option, query);
  if (!match) {
    return <span>{option}</span>;
  }
  return (
    <span>
      {option.slice(0, match.start)}
      <mark>{option.slice(match.start, match.start + match.length)}</mark>
      {option.slice(match.start + match.length)}
    </span>
  );
}

function optionId(listId, index) {
  return `${listId}-option-${index}`;
}
