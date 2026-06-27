import React from "react";

export function Avatar({ conversation }) {
  if (conversation.avatar) {
    return <img className="avatar" src={conversation.avatar} alt="" />;
  }

  return <span className={`avatar avatar-fallback ${conversation.channel.toLowerCase()}`}>{conversation.initials}</span>;
}
