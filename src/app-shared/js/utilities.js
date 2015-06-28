var $body, keyCode, doesSupportInputEvent, scrollIntoView, getElRefOffset, escapeHtml, updateElFontSize, Modal, shortcutManager,
	$document = $(document);

$document.ready(function() {
	$body = $(document.body);
});

(function() {
	"use strict";

	keyCode = {
		TAB: 9,
		ESCAPE: 27
	};

	doesSupportInputEvent = (function() {
		var doesSupport = "oninput" in document.createElement("textarea");

		if (doesSupport && navigator.userAgent.indexOf("MSIE 9.0") != -1) doesSupport = false; // IE 9 supports the input event, but has a buggy implementation that makes it useless in that project

		return doesSupport;
	})();

	if (!String.prototype.trim) String.prototype.trim = function() { return $.trim(this) };

	// Scroll elements into view, horizontally or vertically, when Element.scrollIntoView()
	// doesn't do exactly what we want (e.g., it doesn't always make an el entirely visible
	// if it already partly is).
	//
	// Takes parameters as an object:
	// - Mandatory:
	//   - el: the element to scroll into view (can optionally be replaced with
	//     param.offsets if these numbers are already known)
	//   - ref: the reference element (i.e., the one with the scrollbar) (must be
	//     a valid offset parent – body, table, th, td, or any positioned parent – when
	//     param.el isn't replaced with param.offsets)
	// - Optional:
	//   - axis: "horizontal" or "vertical" (default)
	//   - padding: padding to be left around param.el after scrolling (default: 0)
	scrollIntoView = (function() {
		var scrollIntoView = function(ref, axis, elOffsets, elSize, padding) {
			var refScrollPos, diff,
				scrollPosPropName = (axis == "vertical")? "scrollTop" : "scrollLeft",
				refSize = (axis == "vertical")? ref.offsetHeight : ref.offsetWidth,
				elOuterSize = elSize + padding * 2;

			// Too large to fit in the ref? Position it so as to fill the ref
			if (elOuterSize > refSize) {
				ref[scrollPosPropName] = elOffsets[0] + (elOuterSize - refSize) / 2;
				return;
			}

			refScrollPos = ref[scrollPosPropName];

			// Align to top/left?
			diff = refScrollPos - elOffsets[0] + padding;
			if (diff > 0) {
				ref[scrollPosPropName] -= diff;
				return;
			}

			// Or align to bottom/right?
			diff = elOffsets[1] - (refScrollPos + refSize) + padding;
			if (diff > 0) ref[scrollPosPropName] += diff;

			// Or do nothing
		};

		return function(param) {
			param.padding = param.padding || 0;
			param.axis = (param.axis == "horizontal")? "horizontal" : "vertical";

			var firstOffset;

			if (param.el) {
				param.elSize = (param.axis == "vertical")? param.el.offsetHeight : param.el.offsetWidth;

				firstOffset = getElRefOffset(param.el, (param.axis == "vertical")? "top" : "left", param.ref);
				param.elOffsets = [firstOffset, firstOffset + param.elSize];
			} else {
				// If param.el not set, param.elOffsets shoud be set instead
				param.elSize = param.elOffsets[1] - param.elOffsets[0];
			}
			
			scrollIntoView(param.ref, param.axis, param.elOffsets, param.elSize, param.padding);
		};
	})();

	// Get element offset relative to the reference offset parent (defaults to document.body)
	//
	// Browser compatibility: in IE and Webkit browsers, `position: fixed` elements have a null offsetParent
	// (source: http://www.quirksmode.org/dom/w3c_cssom.html#t33).
	// For this inconsistency to not matter, follow these two rules:
	//   - Don't measure the offset of a `position: fixed` element
	//   - And when you do, make sure the element's offset parents (document.body, and any positioned parent)
	//     aren't offset in the measured direction
	getElRefOffset = function(el, dir, ref) {
		var offsetPosMethodName = (dir != "left")? "offsetTop" : "offsetLeft",
			offset = el[offsetPosMethodName];

		if (!ref) ref = document.body;

		while ((el = el.offsetParent) != ref) {
			offset += el[offsetPosMethodName];
		}

		return offset;
	};

	escapeHtml = (function() {
		var matchingChars = /[&<>"']/g,

			charMap = {
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"\"": "&#34;",
				"'": "&#39;"
			},

			replaceCallback = function(char) {
				return charMap[char];
			};

		return function(str) {
			return str.replace(matchingChars, replaceCallback);
		};
	})();

	// Update an element's font size by adding cssIncrement to the current computed size
	updateElFontSize = function(el, cssIncrement) {
		var fontSize = parseFloat(el.css("font-size"));
		fontSize += cssIncrement;
		el.css("font-size", fontSize);
	};

	Modal = (function() {
		var generateModalMarkup = function(content, buttons) { // Decoys surround the modals' buttons to avoid issues when the prev/next tabbable element is out of the browsing context
				return [
					"<div class=\"modal-container\" style=\"display: none\">",
						"<div class=\"modal\">",
							"<div class=\"content\">"+ content +"</div>",
							"<div class=\"buttons\"><a href=\"#\" class=\"decoy\"></a>"+ buttons +"<a href=\"#\" class=\"decoy\"></a></div>",
						"</div>",
					"</div>"
				].join("");
			},

			openModals = [],

			closeLastOpenModal = function() {
				if (openModals.length) {
					openModals[openModals.length - 1].close();
					return true;
				}

				return false;
			},

			initModalsBindings = function() {
				$document.on("keydown.modal", function(e) {
					if (e.keyCode == keyCode.ESCAPE) {
						var didCloseAModal = closeLastOpenModal();
						if (didCloseAModal) e.stopImmediatePropagation(); // If pressing ESC resulted in a modal being closed, don't propagate the event (we don't want something else to happen in addition to closing the modal). And yes, that variable is only here to make the code more legible. Yes, in addition to this comment. Yes.
					}
				});
			},

			keepFocusInsideModal = function(modal) {
				var decoys = modal.el[0].getElementsByClassName("decoy"),
					firstDecoy = decoys[0],
					lastDecoy = decoys[1],
					firstButton = modal.buttonsEls.first(),
					lastButton = modal.buttonsEls.last();

				modal.el.on("focusin", function(e) {
					e.stopPropagation();

					switch (e.target) {
						case firstDecoy: // The decoy placed before the first button is about to be focused
							lastButton.focus();
							break;
						case lastDecoy: // The decoy placed after the last button is about to be focused
							firstButton.focus();
							break;
					}
				});
			};

		var Modal = function(options) {
			var modal = this;

			modal.el = $(generateModalMarkup(options.content, options.buttons)).appendTo($body);
			modal.buttonsEls = options.buttons? modal.el.find(".buttons .button") : [];

			if (modal.buttonsEls.length) {
				keepFocusInsideModal(modal);
				setTimeout(function() {
					modal.buttonsEls.last().focus()
				}, 0);
			}

			if (typeof options.onInit == "function") setTimeout(function() { options.onInit.call(modal) });
		};

		Modal.prototype.show = function() {
			this.el.show();
			openModals.push(this);
		};

		Modal.prototype.close = function() {
			this.el.trigger("close.modal").remove();
			openModals.splice(openModals.length - 1, 1);
		};

		// Used to enforce the fact that modals are blocking: event handlers that aren't "blocked/disabled" by the modals' transparent overlay
		// should go through this method before getting executed to make sure they're not executed while a modal is open (e.g., keyboard shortcuts handlers).
		Modal.ifNoModalOpen = function() {
			return openModals.length? Promise.reject(Modal.ifNoModalOpen.REJECTION_MSG) : Promise.resolve();
		};

		Modal.ifNoModalOpen.REJECTION_MSG = "A modal is currently open.";

		initModalsBindings();

		return Modal;
	})();

	// Register handlers for keyboard shortcuts using a human-readable format
	shortcutManager = (function() {
		var sequenceSeparator = " + ",
			handlers = new Map(),

			init = function() {
				$body.on("keydown", runMatchingHandler);
			},

			// Run the handler registered with the detected shortcut
			// For the purposes of this app, META (WIN on Win, CMD on Mac) mirrors CTRL
			runMatchingHandler = function(e) {
				if (!e.ctrlKey && !e.metaKey) return; // All shortcuts currently use CTRL (mirrored by META)

				var shortcut, handler,
					sequence = ["CTRL"];

				if (e.shiftKey) sequence.push("SHIFT");
				if (e.altKey) sequence.push("ALT"); // (Option on Mac)

				sequence.push(e.keyCode);
				shortcut = sequence.join(sequenceSeparator);

				handler = handlers.get(shortcut);
				if (!handler) return;

				Modal.ifNoModalOpen()
					.then(handler.bind(null, e))
					.catch(function(reason) {
						e.preventDefault();
						if (reason != Modal.ifNoModalOpen.REJECTION_MSG) throw reason;
					})
					.done();
			};

		$document.ready(init);

		return {
			register: function(shortcut, handler) { // shortcut can be an array of shortcuts to register the same handler on them
				var sequence, sequenceLastIndex, key,
					shortcuts = shortcut instanceof Array? shortcut : [shortcut];

				for (shortcut of shortcuts) {
					// The last fragment of a shortcut should be a character representing a keyboard key: convert it to a keyCode
					sequence = shortcut.split(sequenceSeparator);
					sequenceLastIndex = sequence.length - 1;
					key = sequence[sequenceLastIndex];

					if (keyCode.hasOwnProperty(key)) sequence[sequenceLastIndex] = keyCode[key];
					shortcut = sequence.join(sequenceSeparator);

					handlers.set(shortcut, handler);
				}
			}
		};
	})();
})();