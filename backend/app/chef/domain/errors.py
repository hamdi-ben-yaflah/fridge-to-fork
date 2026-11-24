class EmptyRequestError(Exception):
    pass


class UnsupportedImageTypeError(Exception):
    pass


class ImageTooLargeError(Exception):
    pass


class SuggestionFailedError(Exception):
    pass


class InvalidConversationError(Exception):
    pass
